/* eslint-disable max-params */
import { Context } from "@azure/functions";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as E from "fp-ts/lib/Either";
import { flow, pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { RedisClientFactory } from "../utils/redis";
import { EycaAPIClient } from "../clients/eyca";
import { StatusEnum } from "../generated/definitions/CardActivated";
import { Timestamp } from "../generated/definitions/Timestamp";
import { UserEycaCardModel } from "../models/user_eyca_card";
import { ActivityResult, success } from "../utils/activity";
import { errorsToError } from "../utils/conversions";
import {
  toPermanentFailure,
  toTransientFailure,
  trackFailure
} from "../utils/errors";
import { preIssueCard, updateCard } from "../utils/eyca";

export const ActivityInput = t.interface({
  activationDate: Timestamp,
  expirationDate: Timestamp,
  fiscalCode: FiscalCode
});

export type ActivityInput = t.TypeOf<typeof ActivityInput>;

export const getSuccessEycaActivationActivityHandler = (
  redisClientFactory: RedisClientFactory,
  eycaClient: ReturnType<EycaAPIClient>,
  eycaApiUsername: NonEmptyString,
  eycaApiPassword: NonEmptyString,
  userEycaCardModel: UserEycaCardModel,
  logPrefix: string = "SuccessEycaActivationActivityHandler"
) => async (context: Context, input: unknown): Promise<ActivityResult> => {
  const fail = trackFailure(context, logPrefix);
  return pipe(
    input,
    ActivityInput.decode,
    TE.fromEither,
    TE.mapLeft(
      flow(errorsToError, e =>
        toPermanentFailure(e, "Cannot decode Activity Input")
      )
    ),
    TE.chain(({ fiscalCode, activationDate, expirationDate }) =>
      pipe(
        userEycaCardModel.findLastVersionByModelId([fiscalCode]),
        TE.mapLeft(() =>
          toTransientFailure(
            new Error("Cannot retrieve EYCA card for the provided fiscalCode")
          )
        ),
        TE.chain(maybeEycaCard =>
          pipe(
            maybeEycaCard,
            TE.fromOption(() =>
              toPermanentFailure(
                new Error("No EYCA card found for the provided fiscalCode")
              )
            )
          )
        ),
        TE.chain(eycaCard =>
          pipe(
            preIssueCard(
              redisClientFactory,
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
            }))
          )
        )
      )
    ),
    TE.chain(_ =>
      pipe(
        updateCard(
          redisClientFactory,
          eycaClient,
          eycaApiUsername,
          eycaApiPassword,
          _.card.card_number,
          _.card.expiration_date
        ),
        TE.chain(() =>
          pipe(
            userEycaCardModel.update(_),
            TE.mapLeft(
              flow(E.toError, e =>
                toTransientFailure(e, "Cannot update EYCA card")
              )
            )
          )
        )
      )
    ),
    TE.bimap(fail, success),
    TE.toUnion
  )();
};
