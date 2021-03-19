import * as express from "express";

import { Context } from "@azure/functions";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import * as df from "durable-functions";
import { DurableOrchestrationStatus } from "durable-functions/lib/src/classes";
import { toError } from "fp-ts/lib/Either";
import { isLeft } from "fp-ts/lib/Either";
import { identity } from "fp-ts/lib/function";
import { fromNullable } from "fp-ts/lib/Option";
import {
  fromLeft,
  fromPredicate,
  TaskEither,
  taskEither,
  tryCatch
} from "fp-ts/lib/TaskEither";
import { ContextMiddleware } from "io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredParamMiddleware } from "io-functions-commons/dist/src/utils/middlewares/required_param";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorConflict,
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorInternal,
  IResponseSuccessAccepted,
  IResponseSuccessRedirectToResource,
  ResponseErrorConflict,
  ResponseErrorForbiddenNotAuthorized,
  ResponseErrorInternal,
  ResponseSuccessAccepted,
  ResponseSuccessRedirectToResource
} from "italia-ts-commons/lib/responses";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import {
  CardActivated,
  StatusEnum as ActivatedStatusEnum
} from "../generated/definitions/CardActivated";
import { StatusEnum as ExpiredStatusEnum } from "../generated/definitions/CardExpired";
import { StatusEnum as PendingStatusEnum } from "../generated/definitions/CardPending";
import { StatusEnum as RevokedStatusEnum } from "../generated/definitions/CardRevoked";
import { InstanceId } from "../generated/definitions/InstanceId";
import { UserCgnModel } from "../models/user_cgn";
import { OrchestratorInput } from "../UpdateCgnOrchestrator/handler";
import {
  checkCgnRequirements,
  extractCgnExpirationDate
} from "../utils/cgn_checks";
import { genRandomCardCode } from "../utils/cgnCode";
import {
  checkUpdateCardIsRunning,
  makeUpdateCgnOrchestratorId
} from "../utils/orchestrators";

type ErrorTypes =
  | IResponseErrorInternal
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorConflict;
type ReturnTypes =
  | IResponseSuccessAccepted
  | IResponseSuccessRedirectToResource<InstanceId, InstanceId>
  | ErrorTypes;

type IStartCgnActivationHandler = (
  context: Context,
  fiscalCode: FiscalCode
) => Promise<ReturnTypes>;

const mapOrchestratorStatus = (
  orchestratorStatus: DurableOrchestrationStatus
): TaskEither<IResponseSuccessAccepted, IResponseErrorInternal> => {
  switch (orchestratorStatus.runtimeStatus) {
    case df.OrchestrationRuntimeStatus.Pending:
    case df.OrchestrationRuntimeStatus.Running:
    case df.OrchestrationRuntimeStatus.ContinuedAsNew:
      return fromLeft(ResponseSuccessAccepted());
    default:
      return taskEither.of(
        ResponseErrorInternal("Cannot recognize the orchestrator status")
      );
  }
};

/**
 * Check if a citizen is eligible for CGN activation
 * A citizen is eligible for a CGN while he's from 18 to 35 years old
 * If eligible returns the calculated expiration date for the CGN
 * @param fiscalCode: the citizen's fiscalCode
 */
const getCgnExpirationDataTask = (
  fiscalCode: FiscalCode,
  cgnUpperBoundAge: NonNegativeInteger
): TaskEither<
  IResponseErrorInternal | IResponseErrorForbiddenNotAuthorized,
  Date
> =>
  checkCgnRequirements(fiscalCode, cgnUpperBoundAge)
    .mapLeft<IResponseErrorInternal | IResponseErrorForbiddenNotAuthorized>(
      () => ResponseErrorInternal("Cannot perform CGN Eligibility Check")
    )
    .chain(
      fromPredicate(
        isEligible => isEligible === true,
        () => ResponseErrorForbiddenNotAuthorized
      )
    )
    .chain(() =>
      extractCgnExpirationDate(fiscalCode, cgnUpperBoundAge).mapLeft(() =>
        ResponseErrorInternal("Cannot perform CGN Eligibility Check")
      )
    );

const getCgnCodeTask = () =>
  tryCatch(() => genRandomCardCode(), toError).mapLeft(() =>
    ResponseErrorInternal("Cannot generate a new CGN code")
  );

export function StartCgnActivationHandler(
  userCgnModel: UserCgnModel,
  cgnUpperBoundAge: NonNegativeInteger,
  logPrefix: string = "StartCgnActivationHandler"
): IStartCgnActivationHandler {
  return async (context, fiscalCode) => {
    const client = df.getClient(context);
    const orchestratorId = makeUpdateCgnOrchestratorId(
      fiscalCode,
      ActivatedStatusEnum.ACTIVATED
    ) as NonEmptyString;

    const cgnExpirationDateOrError = await getCgnExpirationDataTask(
      fiscalCode,
      cgnUpperBoundAge
    ).run();
    if (isLeft(cgnExpirationDateOrError)) {
      return cgnExpirationDateOrError.value;
    }

    const card: CardActivated = {
      activation_date: new Date(),
      expiration_date: cgnExpirationDateOrError.value,
      status: ActivatedStatusEnum.ACTIVATED
    };

    return userCgnModel
      .findLastVersionByModelId([fiscalCode])
      .mapLeft<ErrorTypes | IResponseSuccessAccepted>(() =>
        ResponseErrorInternal("Cannot query CGN data")
      )
      .chain(maybeUserCgn =>
        maybeUserCgn.foldL(
          () => taskEither.of(fiscalCode),
          userCgn =>
            // if a CGN is already in a final state we return Conflict
            [
              ActivatedStatusEnum.ACTIVATED.toString(),
              ExpiredStatusEnum.EXPIRED.toString(),
              RevokedStatusEnum.REVOKED.toString()
            ].includes(userCgn.card.status)
              ? fromLeft(
                  ResponseErrorConflict(
                    `Cannot activate a CGN that is already ${userCgn.card.status}`
                  )
                )
              : // if CGN is in PENDING status, try to get orchestrator status
                // in order to discriminate if there's an error or not
                tryCatch(() => client.getStatus(orchestratorId), toError)
                  .mapLeft<ErrorTypes | IResponseSuccessAccepted>(() =>
                    ResponseErrorInternal("Cannot retrieve activation status")
                  )
                  .chain(maybeStatus =>
                    // client getStatus could respond with undefined if
                    // an orchestrator instance does not exists
                    // see https://docs.microsoft.com/it-it/azure/azure-functions/durable/durable-functions-instance-management?tabs=javascript#query-instances
                    fromNullable(maybeStatus).foldL(
                      // if orchestrator does not exists we assume that it expires its storage in TaskHub
                      // after 30 days so we can try to start a new activation process
                      () => taskEither.of(fiscalCode),
                      _ =>
                        // if orchestrator is running we return an Accepted Response
                        // otherwise we assume the orchestrator is in error or
                        // it has been canceled so we can try to start a new activation process
                        mapOrchestratorStatus(_).map(() => fiscalCode)
                    )
                  )
        )
      )
      .chain(() =>
        // now we check if exists another update process for the same CGN
        checkUpdateCardIsRunning(client, fiscalCode, card).foldTaskEither<
          ErrorTypes,
          | IResponseSuccessAccepted
          | IResponseSuccessRedirectToResource<InstanceId, InstanceId>
        >(
          response =>
            response.kind === "IResponseSuccessAccepted"
              ? taskEither.of(response)
              : fromLeft(response),
          () =>
            // We can generate an internal CGN identifier and insert a new CGN in a PENDING status
            getCgnCodeTask()
              .chain(cgnId =>
                userCgnModel
                  .upsert({
                    card: { status: PendingStatusEnum.PENDING },
                    fiscalCode,
                    id: cgnId,
                    kind: "INewUserCgn"
                  })
                  .mapLeft(e =>
                    ResponseErrorInternal(`Cannot insert a new CGN|${e.kind}`)
                  )
              )
              .chain(() =>
                tryCatch(
                  () =>
                    // Starting a new activation process with proper input
                    client.startNew(
                      "UpdateCgnOrchestrator",
                      orchestratorId,
                      OrchestratorInput.encode({
                        fiscalCode,
                        newStatusCard: card
                      })
                    ),
                  toError
                ).mapLeft(err => {
                  context.log.error(
                    `${logPrefix}|Cannot start UpdateCgnOrchestrator|ERROR=${err.message}`
                  );
                  return ResponseErrorInternal(
                    "Cannot start UpdateCgnOrchestrator"
                  );
                })
              )
              .map(() => {
                const instanceId: InstanceId = {
                  id: orchestratorId
                };
                return ResponseSuccessRedirectToResource(
                  instanceId,
                  `/api/v1/cgn/${fiscalCode}/activation`,
                  instanceId
                );
              })
        )
      )
      .fold<ReturnTypes>(identity, identity)
      .run();
  };
}

export function StartCgnActivation(
  userCgnModel: UserCgnModel,
  cgnUpperBoundAge: NonNegativeInteger
): express.RequestHandler {
  const handler = StartCgnActivationHandler(userCgnModel, cgnUpperBoundAge);

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    RequiredParamMiddleware("fiscalcode", FiscalCode)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
