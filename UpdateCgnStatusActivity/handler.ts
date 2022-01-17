import { Context } from "@azure/functions";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import * as E from "fp-ts/lib/Either";
import { flow, pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { Card } from "../generated/definitions/Card";
import { UserCgnModel } from "../models/user_cgn";
import { ActivityResult, success } from "../utils/activity";
import { errorsToError } from "../utils/conversions";
import {
  toPermanentFailure,
  toTransientFailure,
  trackFailure
} from "../utils/errors";

export const ActivityInput = t.interface({
  card: Card,
  fiscalCode: FiscalCode
});

export type ActivityInput = t.TypeOf<typeof ActivityInput>;

export const getUpdateCgnStatusActivityHandler = (
  userCgnModel: UserCgnModel,
  logPrefix: string = "UpdateCgnStatusActivity"
) => (context: Context, input: unknown): Promise<ActivityResult> => {
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
    TE.chain(activityInput =>
      pipe(
        userCgnModel.findLastVersionByModelId([activityInput.fiscalCode]),
        TE.mapLeft(() =>
          toTransientFailure(
            new Error("Cannot retrieve userCgn for the provided fiscalCode")
          )
        ),
        TE.chain(maybeUserCgn =>
          pipe(
            maybeUserCgn,
            TE.fromOption(() =>
              toPermanentFailure(
                new Error("No userCgn found for the provided fiscalCode")
              )
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
          flow(E.toError, e => toTransientFailure(e, "Cannot update userCgn")),
          success
        )
      )
    ),
    TE.mapLeft(fail),
    TE.toUnion
  )();
};
