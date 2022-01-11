import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
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

const OTP_FISCAL_CODE_PREFIX = "OTP_FISCALCODE_";
const OTP_PREFIX = "OTP_";

export const storeOtpAndRelatedFiscalCode = (
  redisClient: RedisClient,
  otpCode: OtpCode,
  payload: OtpPayload,
  otpTtl: NonNegativeInteger
): TE.TaskEither<Error, true> =>
  pipe(
    setWithExpirationTask(
      redisClient,
      `${OTP_PREFIX}${otpCode}`,
      JSON.stringify(payload),
      otpTtl
    ),
    TE.chain(() =>
      setWithExpirationTask(
        redisClient,
        `${OTP_FISCAL_CODE_PREFIX}${payload.fiscalCode}`,
        otpCode,
        otpTtl
      )
    )
  );

export const retrieveOtpByFiscalCode = (
  redisClient: RedisClient,
  fiscalCode: FiscalCode
): TE.TaskEither<Error, O.Option<Otp>> =>
  pipe(
    getTask(redisClient, `${OTP_FISCAL_CODE_PREFIX}${fiscalCode}`),
    TE.chain(
      O.fold(
        () => TE.of(O.none),
        otpCode =>
          pipe(
            getTask(redisClient, `${OTP_PREFIX}${otpCode}`),
            TE.chain(
              O.fold(
                () => TE.of(O.none),
                otpPayloadString =>
                  pipe(
                    TE.fromEither(
                      E.tryCatch(() => JSON.parse(otpPayloadString), E.toError)
                    ),
                    TE.chain(otpPayload =>
                      pipe(
                        Otp.decode({
                          code: otpCode,
                          expires_at: otpPayload.expiresAt,
                          ttl: otpPayload.ttl
                        }),
                        TE.fromEither,
                        TE.bimap(errorsToError, O.some)
                      )
                    )
                  )
              )
            )
          )
      )
    )
  );
