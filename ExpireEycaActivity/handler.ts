import { Context } from "@azure/functions";
import { fromOption, toError } from "fp-ts/lib/Either";
import { identity } from "fp-ts/lib/function";
import { fromEither } from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { FiscalCode } from "italia-ts-commons/lib/strings";
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
  return fromEither(ActivityInput.decode(input))
    .mapLeft(errs => fail(errorsToError(errs), "Cannot decode Activity Input"))
    .chain(activityInput =>
      userEycaCardModel
        .findLastVersionByModelId([activityInput.fiscalCode])
        .mapLeft(() =>
          fail(
            new Error(
              "Cannot retrieve User EYCA Card for the provided fiscalCode"
            )
          )
        )
        .chain(maybeUserEycaCard =>
          fromEither(
            fromOption(
              fail(
                new Error("No User EYCA Card found for the provided fiscalCode")
              )
            )(maybeUserEycaCard)
          )
        )
        .chain(userEycaCard =>
          fromEither(EycaCardActivated.decode(userEycaCard.card)).bimap(
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
    )
    .chain(_ =>
      userEycaCardModel.update(_).bimap(
        err => fail(toError(err), "Cannot update User EYCA Card"),
        () => success()
      )
    )
    .fold<ActivityResult>(identity, identity)
    .run();
};
