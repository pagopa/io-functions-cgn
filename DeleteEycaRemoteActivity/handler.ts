import { Context } from "@azure/functions";
import { identity } from "fp-ts/lib/function";
import { fromEither } from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { RedisClient } from "redis";
import { EycaAPIClient } from "../clients/eyca";
import { CcdbNumber } from "../generated/eyca-api/CcdbNumber";
import { ActivityResult, failure, success } from "../utils/activity";
import { errorsToError } from "../utils/conversions";
import { deleteCard } from "../utils/eyca";

export const ActivityInput = t.interface({
  cardNumber: CcdbNumber
});

export type ActivityInput = t.TypeOf<typeof ActivityInput>;

export const getDeleteEycaRemoteActivityHandler = (
  redisClient: RedisClient,
  eycaClient: ReturnType<EycaAPIClient>,
  eycaApiUsername: NonEmptyString,
  eycaApiPassword: NonEmptyString,
  logPrefix: string = "DeleteEycaRemoteActivityHandler"
) => (context: Context, input: unknown): Promise<ActivityResult> => {
  const fail = failure(context, logPrefix);
  return fromEither(ActivityInput.decode(input))
    .mapLeft(errs => fail(errorsToError(errs), "Cannot decode Activity Input"))
    .chain((input) => deleteCard(redisClient,
      eycaClient,
      eycaApiUsername,
      eycaApiPassword,
      input.cardNumber)
      .mapLeft(fail)
    ).fold<ActivityResult>(identity, () => success())
    .run();
};
