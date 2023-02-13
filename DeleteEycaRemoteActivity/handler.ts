import { Context } from "@azure/functions";
import { flow, pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { RedisClientFactory } from "../utils/redis";
import { EycaAPIClient } from "../clients/eyca";
import { CcdbNumber } from "../generated/eyca-api/CcdbNumber";
import { ActivityResult, success } from "../utils/activity";
import { errorsToError } from "../utils/conversions";
import { deleteCard } from "../utils/eyca";
import { toPermanentFailure, trackFailure } from "../utils/errors";

export const ActivityInput = t.interface({
  cardNumber: CcdbNumber
});

export type ActivityInput = t.TypeOf<typeof ActivityInput>;

export const getDeleteEycaRemoteActivityHandler = (
  redisClientFactory: RedisClientFactory,
  eycaClient: ReturnType<EycaAPIClient>,
  eycaApiUsername: NonEmptyString,
  eycaApiPassword: NonEmptyString,
  logPrefix: string = "DeleteEycaRemoteActivityHandler"
) => async (context: Context, input: unknown): Promise<ActivityResult> => {
  const fail = trackFailure(context, logPrefix);
  const redisClient = await redisClientFactory.getInstance();
  return pipe(
    input,
    ActivityInput.decode,
    TE.fromEither,
    TE.mapLeft(
      flow(errorsToError, e =>
        toPermanentFailure(e, "Cannot decode Activity Input")
      )
    ),
    TE.chain(_ =>
      deleteCard(
        redisClient,
        eycaClient,
        eycaApiUsername,
        eycaApiPassword,
        _.cardNumber
      )
    ),
    TE.bimap(fail, success),
    TE.toUnion
  )();
};
