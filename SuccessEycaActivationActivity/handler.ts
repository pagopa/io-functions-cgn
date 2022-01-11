/* eslint-disable max-params */
import { Context } from "@azure/functions";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { RedisClient } from "redis";
import { EycaAPIClient } from "../clients/eyca";
import { StatusEnum } from "../generated/definitions/CardActivated";
import { Timestamp } from "../generated/definitions/Timestamp";
import { UserEycaCardModel } from "../models/user_eyca_card";
import { ActivityResult, failure, success } from "../utils/activity";
import { errorsToError } from "../utils/conversions";
import { preIssueCard, updateCard } from "../utils/eyca";

export const ActivityInput = t.interface({
  activationDate: Timestamp,
  expirationDate: Timestamp,
  fiscalCode: FiscalCode
});

export type ActivityInput = t.TypeOf<typeof ActivityInput>;

export const getSuccessEycaActivationActivityHandler = (
  redisClient: RedisClient,
  eycaClient: ReturnType<EycaAPIClient>,
  eycaApiUsername: NonEmptyString,
  eycaApiPassword: NonEmptyString,
  userEycaCardModel: UserEycaCardModel,
  logPrefix: string = "SuccessEycaActivationActivityHandler"
) => (context: Context, input: unknown): Promise<ActivityResult> => {
  const fail = failure(context, logPrefix);
  return pipe(
    input,
    ActivityInput.decode,
    TE.fromEither,
    TE.mapLeft(errs =>
      fail(errorsToError(errs), "Cannot decode Activity Input")
    ),
    TE.chain(({ fiscalCode, activationDate, expirationDate }) =>
      pipe(
        userEycaCardModel.findLastVersionByModelId([fiscalCode]),
        TE.mapLeft(() =>
          fail(
            new Error("Cannot retrieve EYCA card for the provided fiscalCode")
          )
        ),
        TE.chain(maybeEycaCard =>
          pipe(
            maybeEycaCard,
            TE.fromOption(() =>
              fail(new Error("No EYCA card found for the provided fiscalCode"))
            )
          )
        ),
        TE.chain(eycaCard =>
          pipe(
            preIssueCard(
              redisClient,
              eycaClient,
              eycaApiUsername,
              eycaApiPassword
            ),
            TE.map(cardNumber => ({
              ...eycaCard,
              card: {
                activation_date: activationDate,
                card_number: cardNumber,
                expiration_date: expirationDate,
                status: StatusEnum.ACTIVATED
              }
            })),
            TE.mapLeft(fail)
          )
        )
      )
    ),
    TE.chain(_ =>
      pipe(
        updateCard(
          redisClient,
          eycaClient,
          eycaApiUsername,
          eycaApiPassword,
          _.card.card_number,
          _.card.expiration_date
        ),
        TE.mapLeft(fail),
        TE.chain(() =>
          pipe(
            userEycaCardModel.update(_),
            TE.mapLeft(err => fail(E.toError(err), "Cannot update EYCA card"))
          )
        )
      )
    ),
    TE.map(() => success()),
    TE.toUnion
  )();
};
