import { Context } from "@azure/functions";
import { fromOption, toError } from "fp-ts/lib/Either";
import { identity } from "fp-ts/lib/function";
import { fromEither } from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import { RedisClient } from "redis";
import { EycaAPIClient } from "../clients/eyca";
import { StatusEnum } from "../generated/definitions/CardActivated";
import { Timestamp } from "../generated/definitions/Timestamp";
import { UserEycaCardModel } from "../models/user_eyca_card";
import { ActivityResult, failure, success } from "../utils/activity";
import { errorsToError } from "../utils/conversions";
import { preIssueCard, updateCard } from "./eyca";

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
  return fromEither(ActivityInput.decode(input))
    .mapLeft(errs => fail(errorsToError(errs), "Cannot decode Activity Input"))
    .chain(({ fiscalCode, activationDate, expirationDate }) =>
      userEycaCardModel
        .findLastVersionByModelId([fiscalCode])
        .mapLeft(() =>
          fail(
            new Error("Cannot retrieve EYCA card for the provided fiscalCode")
          )
        )
        .chain(maybeEycaCard =>
          fromEither(
            fromOption(
              fail(new Error("No EYCA card found for the provided fiscalCode"))
            )(maybeEycaCard)
          )
        )
        .chain(eycaCard =>
          preIssueCard(
            redisClient,
            eycaClient,
            eycaApiUsername,
            eycaApiPassword
          )
            .map(cardNumber => ({
              ...eycaCard,
              card: {
                activation_date: activationDate,
                card_number: cardNumber,
                expiration_date: expirationDate,
                status: StatusEnum.ACTIVATED
              }
            }))
            .mapLeft(fail)
        )
    )
    .chain(_ =>
      updateCard(
        redisClient,
        eycaClient,
        eycaApiUsername,
        eycaApiPassword,
        _.card.card_number,
        _.card.expiration_date
      )
        .mapLeft(fail)
        .chain(() =>
          userEycaCardModel
            .update(_)
            .mapLeft(err => fail(toError(err), "Cannot update EYCA card"))
        )
    )
    .fold<ActivityResult>(identity, () => success())
    .run();
};
