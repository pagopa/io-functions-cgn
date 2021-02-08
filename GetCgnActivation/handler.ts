import * as express from "express";

import { Context } from "@azure/functions";
import * as df from "durable-functions";
import { DurableOrchestrationStatus } from "durable-functions/lib/src/classes";
import { identity } from "fp-ts/lib/function";
import { fromNullable } from "fp-ts/lib/Option";
import { taskEither, TaskEither } from "fp-ts/lib/TaskEither";
import { fromLeft } from "fp-ts/lib/TaskEither";
import { ContextMiddleware } from "io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredParamMiddleware } from "io-functions-commons/dist/src/utils/middlewares/required_param";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import {
  CgnActivatedStatus,
  StatusEnum as ActivatedStatusEnum
} from "../generated/definitions/CgnActivatedStatus";
import {
  CgnActivationDetail,
  StatusEnum
} from "../generated/definitions/CgnActivationDetail";
import { InstanceId } from "../generated/definitions/InstanceId";
import { UserCgnModel } from "../models/user_cgn";
import { retrieveUserCgn } from "../utils/models";
import {
  getOrchestratorStatus,
  makeUpdateCgnOrchestratorId
} from "../utils/orchestrators";

type ResponseTypes =
  | IResponseSuccessJson<CgnActivationDetail>
  | IResponseErrorNotFound
  | IResponseErrorInternal;

type IGetCgnActivationHandler = (
  context: Context,
  fiscalCode: FiscalCode
) => Promise<ResponseTypes>;

const mapOrchestratorStatus = (
  orchestratorStatus: DurableOrchestrationStatus
): TaskEither<IResponseErrorNotFound, StatusEnum> => {
  if (
    orchestratorStatus.customStatus === "UPDATED" ||
    orchestratorStatus.customStatus === "COMPLETED"
  ) {
    return taskEither.of(StatusEnum.COMPLETED);
  }
  switch (orchestratorStatus.runtimeStatus) {
    case df.OrchestrationRuntimeStatus.Pending:
      return taskEither.of(StatusEnum.PENDING);
    case df.OrchestrationRuntimeStatus.Running:
    case df.OrchestrationRuntimeStatus.ContinuedAsNew:
      return taskEither.of(StatusEnum.RUNNING);
    case df.OrchestrationRuntimeStatus.Failed:
      return taskEither.of(StatusEnum.ERROR);
    case df.OrchestrationRuntimeStatus.Completed:
      return taskEither.of(StatusEnum.COMPLETED);
    default:
      return fromLeft(
        ResponseErrorNotFound("Not found", "Cannot recognize status")
      );
  }
};

export function GetCgnActivationHandler(
  userCgnModel: UserCgnModel
): IGetCgnActivationHandler {
  return async (context, fiscalCode) => {
    const client = df.getClient(context);
    const orchestratorId = makeUpdateCgnOrchestratorId(
      fiscalCode,
      ActivatedStatusEnum.ACTIVATED
    ) as NonEmptyString;
    const instanceId = {
      id: orchestratorId
    } as InstanceId;
    // first check if an activation process is running
    return getOrchestratorStatus(client, orchestratorId)
      .mapLeft<IResponseErrorInternal | IResponseErrorNotFound>(() =>
        ResponseErrorInternal("Cannot retrieve activation status")
      )
      .chain<CgnActivationDetail>(maybeOrchestrationStatus =>
        fromNullable(maybeOrchestrationStatus).foldL(
          () =>
            fromLeft(
              ResponseErrorNotFound(
                "Cannot find any activation process",
                "Orchestrator instance not found"
              )
            ),
          orchestrationStatus =>
            // now try to map orchestrator status
            mapOrchestratorStatus(orchestrationStatus).map(_ => ({
              created_at: orchestrationStatus.createdTime,
              instance_id: instanceId,
              last_updated_at: orchestrationStatus.lastUpdatedTime,
              status: _
            }))
        )
      )
      .foldTaskEither<
        IResponseErrorInternal | IResponseErrorNotFound,
        CgnActivationDetail
      >(
        () =>
          // It's not possible to map any activation status
          // check for CGN status on cosmos
          retrieveUserCgn(userCgnModel, fiscalCode)
            .map(_ => _.status)
            .chain(cgnStatus =>
              CgnActivatedStatus.is(cgnStatus)
                ? taskEither.of(StatusEnum.COMPLETED)
                : taskEither.of(StatusEnum.PENDING)
            )
            .map(_ => ({ instance_id: instanceId, status: _ })),
        _ => taskEither.of(_)
      )
      .fold<ResponseTypes>(identity, _ => ResponseSuccessJson(_))
      .run();
  };
}

export function GetCgnActivation(
  userCgnModel: UserCgnModel
): express.RequestHandler {
  const handler = GetCgnActivationHandler(userCgnModel);

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    RequiredParamMiddleware("fiscalcode", FiscalCode)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
