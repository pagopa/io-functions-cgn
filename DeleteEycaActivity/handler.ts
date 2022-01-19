import { Context } from "@azure/functions";
import * as AR from "fp-ts/lib/Array";
import { flow, pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
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

/*
 * have to read the expire data first and then have to return this data for bakcup
 */
export const getDeleteEycaActivityHandler = (
  userEycaModel: UserEycaCardModel,
  logPrefix: string = "DeleteEycaActivity"
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
        userEycaModel.findAllEycaCards(activityInput.fiscalCode),
        TE.mapLeft(_ => toTransientFailure(_, "Cannot retriew all eyca card"))
      )
    ),
    TE.chain(cards =>
      pipe(
        AR.sequence(TE.ApplicativePar)(
          cards.map(element =>
            userEycaModel.deleteVersion(element.fiscalCode, element.id)
          )
        ),
        TE.mapLeft(_ => toTransientFailure(_, "Cannot delete eyca version"))
      )
    ),
    TE.bimap(fail, success),
    TE.toUnion
  )();
};
