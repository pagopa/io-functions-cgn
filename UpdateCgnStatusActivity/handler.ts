import { Context } from "@azure/functions";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
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
  return pipe(
    input,
    ActivityInput.decode,
    TE.fromEither,
    TE.mapLeft(errs =>
      fail(errorsToError(errs), "Cannot decode Activity Input")
    ),
    TE.chain(activityInput =>
      pipe(
        userCgnModel.findLastVersionByModelId([activityInput.fiscalCode]),
        TE.mapLeft(() =>
          fail(new Error("Cannot retrieve userCgn for the provided fiscalCode"))
        ),
        TE.chain(maybeUserCgn =>
          pipe(
            maybeUserCgn,
            TE.fromOption(() =>
              fail(new Error("No userCgn found for the provided fiscalCode"))
            )
          )
        ),
        TE.map(userCgn => ({
          ...userCgn,
          card: activityInput.card
        }))
      )
    ),
    TE.chain(userCgn =>
      pipe(
        userCgnModel.update(userCgn),
        TE.bimap(
          err => fail(E.toError(err), "Cannot update userCgn"),
          () => success()
        )
      )
    ),
    TE.toUnion
  )();
};
