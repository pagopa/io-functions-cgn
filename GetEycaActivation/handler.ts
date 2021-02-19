import * as express from "express";

import { Context } from "@azure/functions";
import * as df from "durable-functions";
import { DurableOrchestrationStatus } from "durable-functions/lib/src/classes";
import { Either, left, right } from "fp-ts/lib/Either";
import { identity } from "fp-ts/lib/function";
import { fromNullable } from "fp-ts/lib/Option";
import { fromEither, taskEither, TaskEither } from "fp-ts/lib/TaskEither";
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
import { FiscalCode } from "italia-ts-commons/lib/strings";
import { CardActivated } from "../generated/definitions/CardActivated";
import { StatusEnum } from "../generated/definitions/CgnActivationDetail";
import { EycaActivationDetail } from "../generated/definitions/EycaActivationDetail";
import { UserEycaCardModel } from "../models/user_eyca_card";
import { retrieveUserEycaCard } from "../utils/models";
import {
  getOrchestratorStatus,
  makeEycaOrchestratorId
} from "../utils/orchestrators";

type ResponseTypes =
  | IResponseSuccessJson<EycaActivationDetail>
  | IResponseErrorNotFound
  | IResponseErrorInternal;

type IGetEycaActivationHandler = (
  context: Context,
  fiscalCode: FiscalCode
) => Promise<ResponseTypes>;

const mapOrchestratorStatus = (
  orchestratorStatus: DurableOrchestrationStatus
): Either<Error, StatusEnum> => {
  if (
    orchestratorStatus.customStatus === "UPDATED" ||
    orchestratorStatus.customStatus === "COMPLETED"
  ) {
    return right(StatusEnum.COMPLETED);
  }
  switch (orchestratorStatus.runtimeStatus) {
    case df.OrchestrationRuntimeStatus.Pending:
      return right(StatusEnum.PENDING);
    case df.OrchestrationRuntimeStatus.Running:
    case df.OrchestrationRuntimeStatus.ContinuedAsNew:
      return right(StatusEnum.RUNNING);
    case df.OrchestrationRuntimeStatus.Failed:
      return right(StatusEnum.ERROR);
    case df.OrchestrationRuntimeStatus.Completed:
      return right(StatusEnum.COMPLETED);
    default:
      return left(new Error("Cannot recognize status"));
  }
};

export function GetEycaActivationHandler(
  userEycaCardModel: UserEycaCardModel
): IGetEycaActivationHandler {
  return async (context, fiscalCode) => {
    const client = df.getClient(context);
    const orchestratorId = makeEycaOrchestratorId(
      fiscalCode,
      StatusEnum.PENDING
    );
    // first check if an activation process is running
    return retrieveUserEycaCard(userEycaCardModel, fiscalCode)
      .map(_ => _.card)
      .chain(eycaCard =>
        getOrchestratorStatus(client, orchestratorId)
          .chain<EycaActivationDetail>(maybeOrchestrationStatus =>
            fromNullable(maybeOrchestrationStatus).foldL(
              () => fromLeft(new Error("Orchestrator instance not found")),
              orchestrationStatus =>
                // now try to map orchestrator status
                fromEither(mapOrchestratorStatus(orchestrationStatus)).map(
                  _ => ({
                    created_at: orchestrationStatus.createdTime,
                    last_updated_at: orchestrationStatus.lastUpdatedTime,
                    status: _
                  })
                )
            )
          )
          .foldTaskEither<
            IResponseErrorInternal | IResponseErrorNotFound,
            EycaActivationDetail
          >(
            () =>
              // It's not possible to map any activation status
              // check for EYCA Card status on cosmos
              taskEither
                .of<
                  IResponseErrorInternal | IResponseErrorNotFound,
                  StatusEnum
                >(
                  CardActivated.is(eycaCard)
                    ? StatusEnum.COMPLETED
                    : StatusEnum.PENDING
                )
                .map(_ => ({ status: _ })),
            activationDetail => taskEither.of(activationDetail)
          )
      )
      .fold<ResponseTypes>(identity, _ => ResponseSuccessJson(_))
      .run();
  };
}

export function GetEycaActivation(
  userEycaCardModel: UserEycaCardModel
): express.RequestHandler {
  const handler = GetEycaActivationHandler(userEycaCardModel);

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    RequiredParamMiddleware("fiscalcode", FiscalCode)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
