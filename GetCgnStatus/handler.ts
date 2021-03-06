import * as express from "express";

import { Context } from "@azure/functions";
import { fromOption } from "fp-ts/lib/Either";
import { identity } from "fp-ts/lib/function";
import { fromEither } from "fp-ts/lib/TaskEither";
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
import { Card } from "../generated/definitions/Card";
import { UserCgnModel } from "../models/user_cgn";

type ResponseTypes =
  | IResponseSuccessJson<Card>
  | IResponseErrorNotFound
  | IResponseErrorInternal;

type IGetCgnStatusHandler = (
  context: Context,
  fiscalCode: FiscalCode
) => Promise<ResponseTypes>;

export function GetCgnStatusHandler(
  userCgnModel: UserCgnModel
): IGetCgnStatusHandler {
  return async (_, fiscalCode) => {
    return userCgnModel
      .findLastVersionByModelId([fiscalCode])
      .mapLeft<IResponseErrorInternal | IResponseErrorNotFound>(() =>
        ResponseErrorInternal("Error trying to retrieve user's CGN status")
      )
      .chain(maybeUserCgn =>
        fromEither(
          fromOption(
            ResponseErrorNotFound("Not Found", "User's CGN status not found")
          )(maybeUserCgn)
        )
      )
      .fold<ResponseTypes>(identity, userCgn =>
        ResponseSuccessJson(userCgn.card)
      )
      .run();
  };
}

export function GetCgnStatus(
  userCgnModel: UserCgnModel
): express.RequestHandler {
  const handler = GetCgnStatusHandler(userCgnModel);

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    RequiredParamMiddleware("fiscalcode", FiscalCode)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
