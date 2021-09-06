import * as express from "express";

import { Context } from "@azure/functions";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredBodyPayloadMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_body_payload";
import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorConflict,
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseSuccessAccepted,
  IResponseSuccessRedirectToResource,
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseSuccessRedirectToResource
} from "@pagopa/ts-commons/lib/responses";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as df from "durable-functions";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
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
    return pipe(
      cgnStatusUpsertRequest,
      TE.of,
      TE.chain(upsertRequest =>
        pipe(
          userCgnModel.findLastVersionByModelId([fiscalCode]),
          TE.bimap(
            () =>
              ResponseErrorInternal("Cannot retrieve CGN infos for this user"),
            maybeUserCgn => ({ maybeUserCgn, card: toCgnStatus(upsertRequest) })
          )
        )
      ),
      TE.chainW(({ card, maybeUserCgn }) =>
        pipe(
          maybeUserCgn,
          TE.fromOption(() =>
            ResponseErrorNotFound("Not Found", "User's CGN status not found")
          ),
          TE.map(userCgn =>
            userCgn.card.status !== PendingStatusEnum.PENDING
              ? {
                  ...card,
                  activation_date: userCgn.card.activation_date,
                  expiration_date: userCgn.card.expiration_date
                }
              : {
                  status: userCgn.card.status
                }
          )
        )
      ),
      TE.chainW(card =>
        pipe(
          checkUpdateCardIsRunning(client, fiscalCode, card),
          TE.chainW(() =>
            pipe(
              TE.tryCatch(
                () =>
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
              TE.bimap(
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
          ),
          TE.orElseW(response =>
            response.kind === "IResponseSuccessAccepted"
              ? TE.of(response)
              : TE.left(response)
          )
        )
      ),
      TE.toUnion
    )();
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
