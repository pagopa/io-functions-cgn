import * as express from "express";

import { Context } from "@azure/functions";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import * as date_fns from "date-fns";
import { fromOption, toError } from "fp-ts/lib/Either";
import { identity } from "fp-ts/lib/function";
import { fromEither, fromPredicate } from "fp-ts/lib/TaskEither";
import { tryCatch } from "fp-ts/lib/TaskEither";
import { ContextMiddleware } from "io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredParamMiddleware } from "io-functions-commons/dist/src/utils/middlewares/required_param";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorInternal,
  IResponseSuccessJson,
  ResponseErrorForbiddenNotAuthorized,
  ResponseErrorInternal,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import { CardActivated } from "../generated/definitions/CardActivated";
import { Otp } from "../generated/definitions/Otp";
import { UserCgnModel } from "../models/user_cgn";
import { generateOtpCode } from "../utils/cgnCode";

type ResponseTypes =
  | IResponseSuccessJson<Otp>
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorInternal;

type IGetGenerateOtpHandler = (
  context: Context,
  fiscalCode: FiscalCode
) => Promise<ResponseTypes>;

export function GetGenerateOtpHandler(
  userCgnModel: UserCgnModel,
  otpTtl: NonNegativeInteger
): IGetGenerateOtpHandler {
  return async (_, fiscalCode) => {
    return userCgnModel
      .findLastVersionByModelId([fiscalCode])
      .mapLeft<IResponseErrorInternal | IResponseErrorForbiddenNotAuthorized>(
        () =>
          ResponseErrorInternal("Error trying to retrieve user's CGN status")
      )
      .chain(maybeUserCgn =>
        fromEither(
          fromOption(ResponseErrorForbiddenNotAuthorized)(maybeUserCgn)
        )
      )
      .chain(
        fromPredicate(
          userCgn => CardActivated.is(userCgn.card),
          () => ResponseErrorForbiddenNotAuthorized
        )
      )
      .chain(() =>
        tryCatch(() => generateOtpCode(), toError).mapLeft(e =>
          ResponseErrorInternal(`Cannot generate OTP Code| ${e.message}`)
        )
      )
      .map(otpCode => ({
        code: otpCode,
        expires_at: date_fns.addSeconds(Date.now(), otpTtl),
        ttl: 10
      }))
      .fold<ResponseTypes>(identity, ResponseSuccessJson)
      .run();
  };
}

export function GetGenerateOtp(
  userCgnModel: UserCgnModel,
  otpTtl: NonNegativeInteger
): express.RequestHandler {
  const handler = GetGenerateOtpHandler(userCgnModel, otpTtl);

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    RequiredParamMiddleware("fiscalcode", FiscalCode)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
