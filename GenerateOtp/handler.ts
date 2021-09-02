import * as express from "express";

import { Context } from "@azure/functions";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import {
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorInternal,
  IResponseSuccessJson,
  ResponseErrorForbiddenNotAuthorized,
  ResponseErrorInternal,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import * as date_fns from "date-fns";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
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
    return pipe(
      userCgnModel.findLastVersionByModelId([fiscalCode]),
      TE.mapLeft(() =>
        ResponseErrorInternal("Error trying to retrieve user's CGN status")
      ),
      TE.chainW(maybeUserCgn =>
        pipe(
          maybeUserCgn,
          E.fromOption(() => ResponseErrorForbiddenNotAuthorized),
          TE.fromEither
        )
      ),
      TE.chainW(
        TE.fromPredicate(
          userCgn => CardActivated.is(userCgn.card),
          () => ResponseErrorForbiddenNotAuthorized
        )
      ),
      TE.chainW(() =>
        pipe(
          retrieveOtpByFiscalCode(redisClient, fiscalCode),
          TE.mapLeft(e =>
            ResponseErrorInternal(
              `Cannot retrieve OTP from fiscalCode| ${e.message}`
            )
          ),
          TE.chain(maybeOtp =>
            pipe(
              maybeOtp,
              O.fold(
                () =>
                  pipe(
                    TE.tryCatch(() => generateOtpCode(), E.toError),
                    TE.mapLeft(e =>
                      ResponseErrorInternal(
                        `Cannot generate OTP Code| ${e.message}`
                      )
                    ),
                    TE.map(otpCode => ({
                      code: otpCode,
                      expires_at: date_fns.addSeconds(Date.now(), otpTtl),
                      ttl: otpTtl
                    })),
                    TE.chain(newOtp =>
                      pipe(
                        storeOtpAndRelatedFiscalCode(
                          redisClient,
                          newOtp.code,
                          {
                            expiresAt: newOtp.expires_at,
                            fiscalCode,
                            ttl: otpTtl
                          },
                          otpTtl
                        ),
                        TE.bimap(
                          err => ResponseErrorInternal(err.message),
                          () => newOtp
                        )
                      )
                    )
                  ),
                otp => TE.of(otp)
              )
            )
          )
        )
      ),
      TE.map(ResponseSuccessJson),
      TE.toUnion
    )();
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
