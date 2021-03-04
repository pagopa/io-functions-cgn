import * as express from "express";

import { Context } from "@azure/functions";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import * as date_fns from "date-fns";
import { fromOption, toError } from "fp-ts/lib/Either";
import { identity } from "fp-ts/lib/function";
import { fromEither, fromPredicate, taskEither } from "fp-ts/lib/TaskEither";
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
import { RedisClient } from "redis";
import { CardActivated } from "../generated/definitions/CardActivated";
import { Otp } from "../generated/definitions/Otp";
import { UserCgnModel } from "../models/user_cgn";
import { generateOtpCode } from "../utils/cgnCode";
import { retrieveOtpByFiscalCode, storeOtpAndRelatedFiscalCode } from "./redis";

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
        retrieveOtpByFiscalCode(redisClient, fiscalCode)
          .mapLeft(e =>
            ResponseErrorInternal(
              `Cannot retrieve OTP from fiscalCode| ${e.message}`
            )
          )
          .chain(maybeOtp =>
            maybeOtp.foldL(
              () =>
                tryCatch(() => generateOtpCode(), toError)
                  .mapLeft(e =>
                    ResponseErrorInternal(
                      `Cannot generate OTP Code| ${e.message}`
                    )
                  )
                  .chain(otpCode => {
                    const newOtp = {
                      code: otpCode,
                      expires_at: date_fns.addSeconds(Date.now(), otpTtl),
                      ttl: otpTtl
                    };
                    return storeOtpAndRelatedFiscalCode(
                      redisClient,
                      newOtp.code,
                      { expiresAt: newOtp.expires_at, fiscalCode, ttl: otpTtl },
                      otpTtl
                    ).bimap(
                      err => ResponseErrorInternal(err.message),
                      () => newOtp
                    );
                  }),
              otp => taskEither.of(otp)
            )
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
