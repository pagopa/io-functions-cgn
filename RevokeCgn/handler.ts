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
import { CgnRevocationRequest } from "../generated/definitions/CgnRevocationRequest";
import {
  CgnRevokedStatus,
  StatusEnum
} from "../generated/definitions/CgnRevokedStatus";
import { InstanceId } from "../generated/definitions/InstanceId";
import { UserCgnModel } from "../models/user_cgn";
import { OrchestratorInput } from "../UpdateCgnOrchestrator";
import { makeUpdateCgnOrchestratorId } from "../utils/orchestrators";
import { checkUpdateCgnIsRunning } from "../utils/orchestrators";

type ErrorTypes =
  | IResponseErrorInternal
  | IResponseErrorNotFound
  | IResponseErrorConflict;
type ReturnTypes =
  | IResponseSuccessAccepted
  | IResponseSuccessRedirectToResource<InstanceId, InstanceId>
  | ErrorTypes;

type IRevokeCgnHandler = (
  context: Context,
  fiscalCode: FiscalCode,
  CgnRevocationRequest: CgnRevocationRequest
) => Promise<ReturnTypes>;

export function RevokeCgnHandler(
  userCgnModel: UserCgnModel,
  logPrefix: string = "RevokeCgnHandler"
): IRevokeCgnHandler {
  return async (context, fiscalCode, revocationReq) => {
    const client = df.getClient(context);
    const revokedCgnStatus: CgnRevokedStatus = {
      revocation_date: new Date(),
      revocation_reason: revocationReq.revocation_reason,
      status: StatusEnum.REVOKED
    };
    const orchestratorId = makeUpdateCgnOrchestratorId(
      fiscalCode,
      StatusEnum.REVOKED
    ) as NonEmptyString;
    return userCgnModel
      .findLastVersionByModelId([fiscalCode])
      .mapLeft<IResponseErrorInternal | IResponseErrorNotFound>(() =>
        ResponseErrorInternal("Cannot retrieve CGN infos for this user")
      )
      .chain(maybeUserCgn =>
        fromEither(
          fromOption(
            ResponseErrorNotFound("Not Found", "User's CGN status not found")
          )(maybeUserCgn)
        )
      )
      .foldTaskEither<
        ErrorTypes,
        | IResponseSuccessAccepted
        | IResponseSuccessRedirectToResource<InstanceId, InstanceId>
      >(fromLeft, () =>
        checkUpdateCgnIsRunning(
          client,
          fiscalCode,
          revokedCgnStatus
        ).foldTaskEither<
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
                    newStatus: revokedCgnStatus
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

export function RevokeCgn(userCgnModel: UserCgnModel): express.RequestHandler {
  const handler = RevokeCgnHandler(userCgnModel);

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    RequiredParamMiddleware("fiscalcode", FiscalCode),
    RequiredBodyPayloadMiddleware(CgnRevocationRequest)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
