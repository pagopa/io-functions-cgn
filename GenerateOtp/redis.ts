import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { toError, tryCatch2v } from "fp-ts/lib/Either";
import { none, Option, some } from "fp-ts/lib/Option";
import {
  fromEither,
  fromPredicate,
  TaskEither,
  taskEither
} from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { RedisClient } from "redis";
import { Otp } from "../generated/definitions/Otp";
import { OtpCode } from "../generated/definitions/OtpCode";
import { Timestamp } from "../generated/definitions/Timestamp";
import { errorsToError } from "../utils/conversions";
import { getTask, setWithExpirationTask } from "../utils/redis_storage";

export const OtpPayload = t.interface({
  expiresAt: Timestamp,
  fiscalCode: FiscalCode,
  ttl: NonNegativeInteger
});

export type OtpPayload = t.TypeOf<typeof OtpPayload>;

const OTP_FISCAL_CODE_PREFIX = "OTP_";

export const storeOtpAndRelatedFiscalCode = (
  redisClient: RedisClient,
  otpCode: OtpCode,
  payload: OtpPayload,
  otpTtl: NonNegativeInteger
): TaskEither<Error, boolean> =>
  setWithExpirationTask(redisClient, otpCode, JSON.stringify(payload), otpTtl)
    .chain(
      fromPredicate(
        _ => _,
        () => new Error("Cannot Store OTP")
      )
    )
    .chain(() =>
      setWithExpirationTask(
        redisClient,
        `${OTP_FISCAL_CODE_PREFIX}${payload.fiscalCode}`,
        otpCode,
        otpTtl
      )
    );

export const retrieveOtpByFiscalCode = (
  redisClient: RedisClient,
  fiscalCode: FiscalCode
): TaskEither<Error, Option<Otp>> =>
  getTask(redisClient, `${OTP_FISCAL_CODE_PREFIX}${fiscalCode}`).chain(_ =>
    _.foldL(
      () => taskEither.of(none),
      otpCode =>
        getTask(redisClient, otpCode).chain(maybeOtp =>
          maybeOtp.foldL(
            () => taskEither.of(none),
            otpPayloadString =>
              fromEither<Error, OtpPayload>(
                tryCatch2v(() => JSON.parse(otpPayloadString), toError)
              ).chain(otpPayload =>
                fromEither(
                  Otp.decode({
                    code: otpCode,
                    expires_at: otpPayload.expiresAt,
                    ttl: otpPayload.ttl
                  }).bimap(errorsToError, some)
                )
              )
          )
        )
    )
  );
