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
import * as t from "io-ts";
import {
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorInternal,
  IResponseSuccessJson,
  ResponseErrorForbiddenNotAuthorized,
  ResponseErrorInternal,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import { RedisClient } from "redis";
import { CardActivated } from "../generated/definitions/CardActivated";
import { Otp } from "../generated/definitions/Otp";
import { OtpCode } from "../generated/definitions/OtpCode";
import { Timestamp } from "../generated/definitions/Timestamp";
import { UserCgnModel } from "../models/user_cgn";
import { generateOtpCode } from "../utils/cgnCode";
import { setWithExpirationTask } from "../utils/redis_storage";

type ResponseTypes =
  | IResponseSuccessJson<Otp>
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorInternal;

type IGetGenerateOtpHandler = (
  context: Context,
  fiscalCode: FiscalCode
) => Promise<ResponseTypes>;

const OtpPayload = t.interface({
  expiresAt: Timestamp,
  fiscalCode: FiscalCode
});

type OtpPayload = t.TypeOf<typeof OtpPayload>;

const storeOtp = (
  redisClient: RedisClient,
  otpCode: OtpCode,
  payload: OtpPayload,
  otpTtl: NonNegativeInteger
) =>
  setWithExpirationTask(redisClient, otpCode, JSON.stringify(payload), otpTtl);

export function GetGenerateOtpHandler(
  userCgnModel: UserCgnModel,
  redisClient: RedisClient,
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
        ttl: otpTtl
      }))
      .chain(otp =>
        storeOtp(
          redisClient,
          otp.code,
          { expiresAt: otp.expires_at, fiscalCode },
          otpTtl
        ).bimap(
          err => ResponseErrorInternal(err.message),
          () => otp
        )
      )
      .fold<ResponseTypes>(identity, ResponseSuccessJson)
      .run();
  };
}

export function GetGenerateOtp(
  userCgnModel: UserCgnModel,
  redisClient: RedisClient,
  otpTtl: NonNegativeInteger
): express.RequestHandler {
  const handler = GetGenerateOtpHandler(userCgnModel, redisClient, otpTtl);

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    RequiredParamMiddleware("fiscalcode", FiscalCode)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
