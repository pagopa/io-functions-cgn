import * as express from "express";

import { Context } from "@azure/functions";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
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
} from "@pagopa/ts-commons/lib/responses";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as df from "durable-functions";
import { DurableOrchestrationStatus } from "durable-functions/lib/src/classes";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
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
): TE.TaskEither<IResponseSuccessAccepted, IResponseErrorInternal> => {
  switch (orchestratorStatus.runtimeStatus) {
    case df.OrchestrationRuntimeStatus.Pending:
    case df.OrchestrationRuntimeStatus.Running:
    case df.OrchestrationRuntimeStatus.ContinuedAsNew:
      return TE.left(ResponseSuccessAccepted());
    default:
      return TE.of(
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
): TE.TaskEither<
  IResponseErrorInternal | IResponseErrorForbiddenNotAuthorized,
  Date
> =>
  pipe(
    checkCgnRequirements(fiscalCode, cgnUpperBoundAge),
    TE.mapLeft(() =>
      ResponseErrorInternal("Cannot perform CGN Eligibility Check")
    ),
    TE.chainW(
      TE.fromPredicate(
        isEligible => isEligible === true,
        () => ResponseErrorForbiddenNotAuthorized
      )
    ),
    TE.chainW(() =>
      pipe(
        extractCgnExpirationDate(fiscalCode, cgnUpperBoundAge),
        TE.mapLeft(() =>
          ResponseErrorInternal("Cannot perform CGN Eligibility Check")
        )
      )
    )
  );

const getCgnCodeTask = () =>
  pipe(
    TE.tryCatch(() => genRandomCardCode(), E.toError),
    TE.mapLeft(() => ResponseErrorInternal("Cannot generate a new CGN code"))
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
    )();
    if (E.isLeft(cgnExpirationDateOrError)) {
      return cgnExpirationDateOrError.left;
    }

    const card: CardActivated = {
      activation_date: new Date(),
      expiration_date: cgnExpirationDateOrError.right,
      status: ActivatedStatusEnum.ACTIVATED
    };

    return pipe(
      userCgnModel.findLastVersionByModelId([fiscalCode]),
      TE.mapLeft(() => ResponseErrorInternal("Cannot query CGN data")),
      TE.chain(
        O.fold(
          () => TE.of(fiscalCode),
          userCgn =>
            // if a CGN is already in a final state we return Conflict
            [
              ActivatedStatusEnum.ACTIVATED.toString(),
              ExpiredStatusEnum.EXPIRED.toString(),
              RevokedStatusEnum.REVOKED.toString()
            ].includes(userCgn.card.status)
              ? TE.left<
                  | IResponseErrorConflict
                  | IResponseErrorInternal
                  | IResponseSuccessAccepted<undefined>,
                  FiscalCode
                >(
                  ResponseErrorConflict(
                    `Cannot activate a CGN that is already ${userCgn.card.status}`
                  )
                )
              : // if CGN is in PENDING status, try to get orchestrator status
                // in order to discriminate if there's an error or not
                pipe(
                  TE.tryCatch(
                    () => client.getStatus(orchestratorId),
                    E.toError
                  ),
                  TE.mapLeft(() =>
                    ResponseErrorInternal("Cannot retrieve activation status")
                  ),
                  TE.chainW(maybeStatus =>
                    // client getStatus could respond with undefined if
                    // an orchestrator instance does not exists
                    // see https://docs.microsoft.com/it-it/azure/azure-functions/durable/durable-functions-instance-management?tabs=javascript#query-instances
                    pipe(
                      maybeStatus,
                      O.fromNullable,
                      O.fold(
                        // if orchestrator does not exists we assume that it expires its storage in TaskHub
                        // after 30 days so we can try to start a new activation process
                        () => TE.of(fiscalCode),
                        _ =>
                          // if orchestrator is running we return an Accepted Response
                          // otherwise we assume the orchestrator is in error or
                          // it has been canceled so we can try to start a new activation process
                          pipe(
                            mapOrchestratorStatus(_),
                            TE.map(() => fiscalCode)
                          )
                      )
                    )
                  )
                )
        )
      ),
      TE.chainW(() =>
        // now we check if exists another update process for the same CGN
        pipe(
          checkUpdateCardIsRunning(client, fiscalCode, card),
          TE.chainW(() =>
            // We can generate an internal CGN identifier and insert a new CGN in a PENDING status
            pipe(
              getCgnCodeTask(),
              TE.chain(cgnId =>
                pipe(
                  userCgnModel.upsert({
                    card: { status: PendingStatusEnum.PENDING },
                    fiscalCode,
                    id: cgnId,
                    kind: "INewUserCgn"
                  }),
                  TE.mapLeft(e =>
                    ResponseErrorInternal(`Cannot insert a new CGN|${e.kind}`)
                  )
                )
              ),
              TE.chain(() =>
                pipe(
                  TE.tryCatch(
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
                    E.toError
                  ),
                  TE.mapLeft(err => {
                    context.log.error(
                      `${logPrefix}|Cannot start UpdateCgnOrchestrator|ERROR=${err.message}`
                    );
                    return ResponseErrorInternal(
                      "Cannot start UpdateCgnOrchestrator"
                    );
                  })
                )
              ),
              TE.map(() => {
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
        )
      ),
      TE.toUnion
    )();
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
