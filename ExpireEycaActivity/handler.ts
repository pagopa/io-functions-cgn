import { Context } from "@azure/functions";
import { toError } from "fp-ts/lib/Either";
import { flow, pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";

import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import * as t from "io-ts";
import { StatusEnum as CardExpiredStatus } from "../generated/definitions/CardExpired";
import { EycaCardActivated } from "../generated/definitions/EycaCardActivated";
import { UserEycaCardModel } from "../models/user_eyca_card";
import { ActivityResult, success } from "../utils/activity";
import { errorsToError } from "../utils/conversions";
import {
  toPermanentFailure,
  toTransientFailure,
  trackFailure
} from "../utils/errors";

export const ActivityInput = t.interface({
  fiscalCode: FiscalCode
});

export type ActivityInput = t.TypeOf<typeof ActivityInput>;

export const getExpireEycaActivityHandler = (
  userEycaCardModel: UserEycaCardModel,
  logPrefix: string = "ExpireEycaActivity"
) => (context: Context, input: unknown): Promise<ActivityResult> => {
  const fail = trackFailure(context, logPrefix);
  return pipe(
    input,
    ActivityInput.decode,
    TE.fromEither,
    TE.mapLeft(
      flow(errorsToError, e =>
        toPermanentFailure(e, "Cannot decode activity input")
      )
    ),
    TE.chain(activityInput =>
      pipe(
        userEycaCardModel.findLastVersionByModelId([activityInput.fiscalCode]),
        TE.mapLeft(
          flow(toError, e =>
            toTransientFailure(
              e,
              "Cannot retrieve User EYCA Card for the provided fiscalCode"
            )
          )
        )
      )
    ),
    TE.chain(
      TE.fromOption(() =>
        toPermanentFailure(
          new Error("No User EYCA Card found for the provided fiscalCode")
        )
      )
    ),
    TE.chain(userEycaCard =>
      pipe(
        userEycaCard.card,
        EycaCardActivated.decode,
        TE.fromEither,
        TE.bimap(
          () =>
            toPermanentFailure(
              new Error("Cannot expire an EYCA Card that is not ACTIVATED")
            ),
          card => ({
            ...userEycaCard,
            card: {
              ...card,
              status: CardExpiredStatus.EXPIRED
            }
          })
        )
      )
    ),
    TE.chain(userEycaCard =>
      pipe(
        userEycaCardModel.update(userEycaCard),
        TE.bimap(
          err =>
            toTransientFailure(toError(err), "Cannot update User EYCA Card"),
          success
        )
      )
    ),
    TE.mapLeft(fail),
    TE.toUnion
  )();
};
