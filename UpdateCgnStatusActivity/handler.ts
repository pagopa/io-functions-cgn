import { Context } from "@azure/functions";
import { fromOption, toError } from "fp-ts/lib/Either";
import { identity } from "fp-ts/lib/function";
import { fromEither } from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import { Card } from "../generated/definitions/Card";
import { UserCgnModel } from "../models/user_cgn";
import { ActivityResult, failure, success } from "../utils/activity";
import { errorsToError } from "../utils/conversions";

export const ActivityInput = t.interface({
  card: Card,
  fiscalCode: FiscalCode
});

export type ActivityInput = t.TypeOf<typeof ActivityInput>;

export const getUpdateCgnStatusActivityHandler = (
  userCgnModel: UserCgnModel,
  logPrefix: string = "UpdateCgnStatusActivity"
) => (context: Context, input: unknown): Promise<ActivityResult> => {
  const fail = failure(context, logPrefix);
  return fromEither(ActivityInput.decode(input))
    .mapLeft(errs => fail(errorsToError(errs), "Cannot decode Activity Input"))
    .chain(activityInput =>
      userCgnModel
        .findLastVersionByModelId([activityInput.fiscalCode])
        .mapLeft(() =>
          fail(new Error("Cannot retrieve userCgn for the provided fiscalCode"))
        )
        .chain(maybeUserCgn =>
          fromEither(
            fromOption(
              fail(new Error("No userCgn found for the provided fiscalCode"))
            )(maybeUserCgn)
          )
        )
        .map(userCgn => ({
          ...userCgn,
          card: activityInput.card
        }))
    )
    .chain(_ =>
      userCgnModel.update(_).bimap(
        err => fail(toError(err), "Cannot update userCgn"),
        () => success()
      )
    )
    .fold<ActivityResult>(identity, identity)
    .run();
};
