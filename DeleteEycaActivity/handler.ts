import { Context } from "@azure/functions";
import * as AR from "fp-ts/lib/Array";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import {
  RetrievedUserEycaCard,
  UserEycaCardModel
} from "../models/user_eyca_card";
import {
  ActivityResultFailure,
  ActivityResultSuccess as CommonActivityResultSuccess,
  failure
} from "../utils/activity";
import { errorsToError } from "../utils/conversions";

export const ActivityInput = t.interface({
  fiscalCode: FiscalCode
});

export type ActivityInput = t.TypeOf<typeof ActivityInput>;

export const DeleteEycaActivityResultSuccess = t.intersection([
  CommonActivityResultSuccess,
  t.interface({
    cards: t.readonlyArray(RetrievedUserEycaCard)
  })
]);

export type DeleteEycaActivityResultSuccess = t.TypeOf<
  typeof DeleteEycaActivityResultSuccess
>;

export const DeleteEycaActivityResult = t.union(
  [DeleteEycaActivityResultSuccess, ActivityResultFailure],
  "kind"
);

export type DeleteEycaActivityResult = t.TypeOf<
  typeof DeleteEycaActivityResult
>;

/*
 * have to read the expire data first and then have to return this data for bakcup
 */
export const getDeleteEycaActivityHandler = (
  userEycaModel: UserEycaCardModel,
  logPrefix: string = "DeleteEycaActivity"
) => (context: Context, input: unknown): Promise<DeleteEycaActivityResult> => {
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
        userEycaModel.findAll(activityInput.fiscalCode),
        TE.mapLeft(_ => fail(_, "Cannot retriew all eyca card"))
      )
    ),
    TE.chain(cards =>
      pipe(
        AR.sequence(TE.ApplicativePar)(
          cards.map(element =>
            userEycaModel.deleteVersion(element.fiscalCode, element.id)
          )
        ),
        TE.mapLeft(_ => fail(_, "Cannot delete eyca version")),
        TE.map(() => ({
          cards,
          kind: "SUCCESS" as const
        }))
      )
    ),
    TE.toUnion
  )();
};
