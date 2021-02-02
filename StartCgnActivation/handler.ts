import * as express from "express";

import { Context } from "@azure/functions";
import * as df from "durable-functions";
import { DurableOrchestrationStatus } from "durable-functions/lib/src/classes";
import { toError } from "fp-ts/lib/Either";
import { isLeft } from "fp-ts/lib/Either";
import { identity } from "fp-ts/lib/function";
import { fromNullable } from "fp-ts/lib/Option";
import {
  fromLeft,
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
  IResponseErrorNotFound,
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
  CgnActivatedStatus,
  StatusEnum as ActivatedStatusEnum
} from "../generated/definitions/CgnActivatedStatus";
import { StatusEnum as ExpiredStatusEnum } from "../generated/definitions/CgnExpiredStatus";
import { StatusEnum as PendingStatusEnum } from "../generated/definitions/CgnPendingStatus";
import { StatusEnum as RevokedStatusEnum } from "../generated/definitions/CgnRevokedStatus";
import { InstanceId } from "../generated/definitions/InstanceId";
import { UserCgnModel } from "../models/user_cgn";
import { OrchestratorInput } from "../UpdateCgnOrchestrator";
import {
  checkCgnRequirements,
  extractCgnExpirationDate
} from "../utils/cgn_checks";
import { genRandomCgnCode } from "../utils/cgnCode";
import { makeUpdateCgnOrchestratorId } from "../utils/orchestrators";
import { checkUpdateCgnIsRunning } from "../utils/orchestrators";

type ErrorTypes =
  | IResponseErrorInternal
  | IResponseErrorNotFound
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
): TaskEither<
  IResponseErrorConflict | IResponseErrorInternal | IResponseSuccessAccepted,
  void
> => {
  switch (orchestratorStatus.runtimeStatus) {
    case df.OrchestrationRuntimeStatus.Pending:
    case df.OrchestrationRuntimeStatus.Running:
    case df.OrchestrationRuntimeStatus.ContinuedAsNew:
      return fromLeft(ResponseSuccessAccepted());
    default:
      return taskEither.of(void 0);
  }
};

const getCgnEligibleDataTask = (fiscalCode: FiscalCode) =>
  checkCgnRequirements(fiscalCode).foldTaskEither<
    IResponseErrorInternal | IResponseErrorForbiddenNotAuthorized,
    Date
  >(
    () =>
      fromLeft(ResponseErrorInternal("Cannot perform CGN Eligibility Check")),
    isEligible =>
      isEligible
        ? extractCgnExpirationDate(fiscalCode).mapLeft(() =>
            ResponseErrorInternal("Cannot perform CGN Eligibility Check")
          )
        : fromLeft(ResponseErrorForbiddenNotAuthorized)
  );

const getCgnCodeTask = () =>
  tryCatch(() => genRandomCgnCode(), toError).mapLeft(() =>
    ResponseErrorInternal("Cannot generate a new CGN code")
  );

export function StartCgnActivationHandler(
  userCgnModel: UserCgnModel,
  logPrefix: string = "StartCgnActivationHandler"
): IStartCgnActivationHandler {
  return async (context, fiscalCode) => {
    const client = df.getClient(context);
    const orchestratorId = makeUpdateCgnOrchestratorId(
      fiscalCode,
      ActivatedStatusEnum.ACTIVATED
    ) as NonEmptyString;

    const isEligibleResponseOrError = await getCgnEligibleDataTask(
      fiscalCode
    ).run();
    if (isLeft(isEligibleResponseOrError)) {
      return isEligibleResponseOrError.value;
    }

    const cgnStatus: CgnActivatedStatus = {
      activation_date: new Date(),
      expiration_date: isEligibleResponseOrError.value,
      status: ActivatedStatusEnum.ACTIVATED
    };

    // first we try to get the status of an activation process for the provided fiscalCode
    return tryCatch(() => client.getStatus(orchestratorId), toError)
      .foldTaskEither<
        | IResponseErrorConflict
        | IResponseErrorInternal
        | IResponseSuccessAccepted,
        void
      >(
        () =>
          fromLeft(ResponseErrorInternal("Cannot retrieve activation status")),
        maybeStatus =>
          // client getStatus could respond with undefined if
          // an orchestrator instance does not exists
          // see https://docs.microsoft.com/it-it/azure/azure-functions/durable/durable-functions-instance-management?tabs=javascript#query-instances
          fromNullable(maybeStatus).foldL(
            () => taskEither.of(void 0),
            _ => mapOrchestratorStatus(_)
          )
      )
      .chain(() =>
        // now we try to retrieve an existing CGN, if it exists
        userCgnModel
          .findLastVersionByModelId([fiscalCode])
          .mapLeft(() => ResponseErrorInternal("Cannot query CGN data"))
      )
      .foldTaskEither<ErrorTypes | IResponseSuccessAccepted, FiscalCode>(
        fromLeft,
        maybeUserCgn =>
          maybeUserCgn.foldL(
            () => taskEither.of(fiscalCode),
            userCgn =>
              // if a CGN is already in a final state we return Conflict
              [
                ActivatedStatusEnum.ACTIVATED.toString(),
                ExpiredStatusEnum.EXPIRED.toString(),
                RevokedStatusEnum.REVOKED.toString()
              ].includes(userCgn.status.status)
                ? fromLeft(
                    ResponseErrorConflict(
                      `Cannot activate a CGN that is already ${userCgn.status.status}`
                    )
                  )
                : taskEither.of(fiscalCode)
          )
      )
      .chain(() =>
        // now we check if exists another update process for the same CGN
        checkUpdateCgnIsRunning(client, fiscalCode, cgnStatus).foldTaskEither<
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
                    fiscalCode,
                    id: cgnId,
                    kind: "INewUserCgn",
                    status: { status: PendingStatusEnum.PENDING }
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
                        newStatus: cgnStatus
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
  userCgnModel: UserCgnModel
): express.RequestHandler {
  const handler = StartCgnActivationHandler(userCgnModel);

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    RequiredParamMiddleware("fiscalcode", FiscalCode)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
