import { Context } from "@azure/functions";
import { toError } from "fp-ts/lib/Either";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";

import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import * as t from "io-ts";
import { StatusEnum as CardExpiredStatus } from "../generated/definitions/CardExpired";
import { EycaCardActivated } from "../generated/definitions/EycaCardActivated";
import { UserEycaCardModel } from "../models/user_eyca_card";
import { ActivityResult, failure, success } from "../utils/activity";
import { errorsToError } from "../utils/conversions";

export const ActivityInput = t.interface({
  fiscalCode: FiscalCode
});

export type ActivityInput = t.TypeOf<typeof ActivityInput>;

export const getExpireEycaActivityHandler = (
  userEycaCardModel: UserEycaCardModel,
  logPrefix: string = "ExpireEycaActivity"
) => (context: Context, input: unknown): Promise<ActivityResult> => {
  const fail = failure(context, logPrefix);
  return pipe(
    input,
    ActivityInput.decode,
    TE.fromEither,
    TE.mapLeft(errs =>
      fail(errorsToError(errs), "Cannot decode Activity Input")
    ),
    TE.chain(activityInput =>
      pipe(
        userEycaCardModel.findLastVersionByModelId([activityInput.fiscalCode]),
        TE.mapLeft(() =>
          fail(
            new Error(
              "Cannot retrieve User EYCA Card for the provided fiscalCode"
            )
          )
        ),
        TE.chain(maybeUserEycaCard =>
          pipe(
            maybeUserEycaCard,
            E.fromOption(() =>
              fail(
                new Error("No User EYCA Card found for the provided fiscalCode")
              )
            ),
            TE.fromEither
          )
        ),
        TE.chain(userEycaCard =>
          pipe(
            userEycaCard.card,
            EycaCardActivated.decode,
            TE.fromEither,
            TE.bimap(
              () =>
                fail(
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
        TE.chain(_ =>
          pipe(
            userEycaCardModel.update(_),
            TE.bimap(
              err => fail(toError(err), "Cannot update User EYCA Card"),
              () => success()
            )
          )
        )
      )
    ),
    TE.toUnion
  )();
};
