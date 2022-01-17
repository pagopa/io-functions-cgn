import { Context } from "@azure/functions";
import * as AR from "fp-ts/lib/Array";
import { flow, pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { UserCgnModel } from "../models/user_cgn";
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

/*
 * have to read the expire data first and then have to return this data for bakcup
 */
export const getDeleteCgnActivityHandler = (
  userCgnModel: UserCgnModel,
  logPrefix: string = "DeleteCgnActivity"
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
    TE.chainW(activityInput =>
      pipe(
        userCgnModel.findAll(activityInput.fiscalCode),
        TE.mapLeft(_ => toTransientFailure(_, "Cannot retrieve all cgn card"))
      )
    ),
    TE.chainW(cards =>
      pipe(
        AR.sequence(TE.ApplicativePar)(
          cards.map(element =>
            userCgnModel.deleteVersion(element.fiscalCode, element.id)
          )
        ),
        TE.mapLeft(_ => toTransientFailure(_, "Cannot delete cgn version"))
      )
    ),
    TE.bimap(fail, success),
    TE.toUnion
  )();
};
