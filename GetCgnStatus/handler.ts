import * as express from "express";

import { Context } from "@azure/functions";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
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
    return pipe(
      userCgnModel.findLastVersionByModelId([fiscalCode]),
      TE.mapLeft(() =>
        ResponseErrorInternal("Error trying to retrieve user's CGN status")
      ),
      TE.chainW(maybeUserCgn =>
        pipe(
          maybeUserCgn,
          TE.fromOption(() =>
            ResponseErrorNotFound("Not Found", "User's CGN status not found")
          )
        )
      ),
      TE.map(userCgn => ResponseSuccessJson(userCgn.card)),
      TE.toUnion
    )();
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
