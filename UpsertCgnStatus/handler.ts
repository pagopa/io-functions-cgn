import * as express from "express";

import { Context } from "@azure/functions";
import * as df from "durable-functions";
import { fromOption, toError } from "fp-ts/lib/Either";
import { identity } from "fp-ts/lib/function";
import { fromLeft, taskEither, tryCatch } from "fp-ts/lib/TaskEither";
import { fromEither } from "fp-ts/lib/TaskEither";
import { ContextMiddleware } from "io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredBodyPayloadMiddleware } from "io-functions-commons/dist/src/utils/middlewares/required_body_payload";
import { RequiredParamMiddleware } from "io-functions-commons/dist/src/utils/middlewares/required_param";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorConflict,
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseSuccessAccepted,
  IResponseSuccessRedirectToResource,
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseSuccessRedirectToResource
} from "italia-ts-commons/lib/responses";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import { StatusEnum as PendingStatusEnum } from "../generated/definitions/CardPending";

import { StatusEnum } from "../generated/definitions/CardRevoked";
import { CgnStatusUpsertRequest } from "../generated/definitions/CgnStatusUpsertRequest";
import { InstanceId } from "../generated/definitions/InstanceId";
import { UserCgnModel } from "../models/user_cgn";
import { OrchestratorInput } from "../UpdateCgnOrchestrator/handler";
import { makeUpdateCgnOrchestratorId } from "../utils/orchestrators";
import { checkUpdateCardIsRunning } from "../utils/orchestrators";

type ErrorTypes =
  | IResponseErrorInternal
  | IResponseErrorNotFound
  | IResponseErrorConflict;
type ReturnTypes =
  | IResponseSuccessAccepted
  | IResponseSuccessRedirectToResource<InstanceId, InstanceId>
  | ErrorTypes;

type IUpsertCgnStatusHandler = (
  context: Context,
  fiscalCode: FiscalCode,
  cgnStatusUpsertRequest: CgnStatusUpsertRequest
) => Promise<ReturnTypes>;

const toCgnStatus = (cgnStatusUpsertRequest: CgnStatusUpsertRequest) => {
  return {
    revocation_date: new Date(),
    revocation_reason: cgnStatusUpsertRequest.revocation_reason,
    status: StatusEnum.REVOKED
  };
};

export function UpsertCgnStatusHandler(
  userCgnModel: UserCgnModel,
  logPrefix: string = "UpsertCgnStatusHandler"
): IUpsertCgnStatusHandler {
  return async (context, fiscalCode, cgnStatusUpsertRequest) => {
    const client = df.getClient(context);
    const orchestratorId = makeUpdateCgnOrchestratorId(
      fiscalCode,
      StatusEnum.REVOKED
    ) as NonEmptyString;

    return taskEither
      .of<
        IResponseErrorInternal | IResponseErrorNotFound,
        CgnStatusUpsertRequest
      >(cgnStatusUpsertRequest)
      .chain(_ =>
        userCgnModel.findLastVersionByModelId([fiscalCode]).bimap(
          () =>
            ResponseErrorInternal("Cannot retrieve CGN infos for this user"),
          maybeUserCgn => ({ maybeUserCgn, card: toCgnStatus(_) })
        )
      )
      .chain(({ card, maybeUserCgn }) =>
        fromEither(
          fromOption(
            ResponseErrorNotFound("Not Found", "User's CGN status not found")
          )(maybeUserCgn)
        ).map(_ =>
          _.card.status !== PendingStatusEnum.PENDING
            ? {
                ...card,
                activation_date: _.card.activation_date,
                expiration_date: _.card.expiration_date
              }
            : {
                status: _.card.status
              }
        )
      )
      .foldTaskEither<
        ErrorTypes,
        | IResponseSuccessAccepted
        | IResponseSuccessRedirectToResource<InstanceId, InstanceId>
      >(fromLeft, card =>
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
            tryCatch(
              () =>
                client.startNew(
                  "UpdateCgnOrchestrator",
                  orchestratorId,
                  OrchestratorInput.encode({
                    fiscalCode,
                    newStatusCard: card
                  })
                ),
              toError
            ).bimap(
              err => {
                context.log.error(
                  `${logPrefix}|Cannot start UpdateCgnOrchestrator|ERROR=${err.message}`
                );
                return ResponseErrorInternal(
                  "Cannot start UpdateCgnOrchestrator"
                );
              },
              () => {
                const instanceId: InstanceId = {
                  id: orchestratorId
                };
                return ResponseSuccessRedirectToResource(
                  instanceId,
                  `/api/v1/cgn/status/${fiscalCode}`,
                  instanceId
                );
              }
            )
        )
      )
      .fold<ReturnTypes>(identity, identity)
      .run();
  };
}

export function UpsertCgnStatus(
  userCgnModel: UserCgnModel
): express.RequestHandler {
  const handler = UpsertCgnStatusHandler(userCgnModel);

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    RequiredParamMiddleware("fiscalcode", FiscalCode),
    RequiredBodyPayloadMiddleware(CgnStatusUpsertRequest)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
