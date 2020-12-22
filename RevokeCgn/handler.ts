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
  ResponseErrorConflict,
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseSuccessAccepted
} from "italia-ts-commons/lib/responses";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import { CgnCanceledStatus } from "../generated/definitions/CgnCanceledStatus";
import { CgnRevokationRequest } from "../generated/definitions/CgnRevokationRequest";
import { CgnRevokedStatus } from "../generated/definitions/CgnRevokedStatus";
import { CgnStatus } from "../generated/definitions/CgnStatus";
import { UserCgnModel } from "../models/user_cgn";
import { OrchestratorInput } from "../RevokeCgnOrchestrator";
import { makeRevokeCgnOrchestratorId } from "../utils/orchestrators";
import { checkRevokeCgnIsRunning } from "./orchestrators";

type ErrorTypes =
  | IResponseErrorInternal
  | IResponseErrorNotFound
  | IResponseErrorConflict;
type ReturnTypes = IResponseSuccessAccepted | ErrorTypes;

type IRevokeCgnHandler = (
  context: Context,
  fiscalCode: FiscalCode,
  cgnRevokationRequest: CgnRevokationRequest
) => Promise<ReturnTypes>;

const checkExistingCgnStatus = (cgnStatus: CgnStatus) =>
  CgnRevokedStatus.is(cgnStatus) || CgnCanceledStatus.is(cgnStatus)
    ? fromLeft<IResponseErrorConflict, CgnStatus>(
        ResponseErrorConflict(
          "Cannot revoke the user's cgn because it is already revoked or canceled"
        )
      )
    : taskEither.of<IResponseErrorConflict, CgnStatus>(cgnStatus);

export function RevokeCgnHandler(
  userCgnModel: UserCgnModel
): IRevokeCgnHandler {
  return async (context, fiscalCode, revokationReq) => {
    const client = df.getClient(context);
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
      .foldTaskEither<ErrorTypes, CgnStatus>(fromLeft, userCgn =>
        checkExistingCgnStatus(userCgn.status)
      )
      .chain(_ =>
        checkRevokeCgnIsRunning(client, fiscalCode).foldTaskEither<
          ErrorTypes,
          IResponseSuccessAccepted
        >(
          response =>
            response.kind === "IResponseSuccessAccepted"
              ? taskEither.of(response)
              : fromLeft(response),
          () =>
            tryCatch(
              () =>
                client.startNew(
                  "RevokeCgnOrchestrator",
                  makeRevokeCgnOrchestratorId(fiscalCode),
                  OrchestratorInput.encode({
                    fiscalCode,
                    revokeMotivation: revokationReq.motivation as NonEmptyString
                  })
                ),
              toError
            ).bimap(
              () => ResponseErrorInternal("Cannot call RevokeCgnOrchestrator"),
              () => ResponseSuccessAccepted("Request Accepted")
            )
        )
      )
      .fold<ReturnTypes>(identity, () =>
        ResponseSuccessAccepted("Request accepted")
      )
      .run();
  };
}

export function RevokeCgn(userCgnModel: UserCgnModel): express.RequestHandler {
  const handler = RevokeCgnHandler(userCgnModel);

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    RequiredParamMiddleware("fiscalCode", FiscalCode),
    RequiredBodyPayloadMiddleware(CgnRevokationRequest)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
