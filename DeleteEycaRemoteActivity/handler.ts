import { Context } from "@azure/functions";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
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
  return pipe(
    input,
    ActivityInput.decode,
    TE.fromEither,
    TE.mapLeft(errs =>
      fail(errorsToError(errs), "Cannot decode Activity Input")
    ),
    TE.chain(_ =>
      pipe(
        deleteCard(
          redisClient,
          eycaClient,
          eycaApiUsername,
          eycaApiPassword,
          _.cardNumber
        ),
        TE.bimap(fail, () => success())
      )
    ),
    TE.toUnion
  )();
};
