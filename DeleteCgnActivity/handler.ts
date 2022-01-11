import { Context } from "@azure/functions";
import * as AR from "fp-ts/lib/Array";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { RetrievedUserCgn, UserCgnModel } from "../models/user_cgn";
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

export const DeleteCgnActivityResultSuccess = t.intersection([
  CommonActivityResultSuccess,
  t.interface({ cards: t.readonlyArray(RetrievedUserCgn) })
]);

export type DeleteCgnActivityResultSuccess = t.TypeOf<
  typeof DeleteCgnActivityResultSuccess
>;

export const DeleteCgnActivityResult = t.taggedUnion("kind", [
  DeleteCgnActivityResultSuccess,
  ActivityResultFailure
]);

export type DeleteCgnActivityResult = t.TypeOf<typeof DeleteCgnActivityResult>;

/*
 * have to read the expire data first and then have to return this data for bakcup
 */
export const getDeleteCgnActivityHandler = (
  userCgnModel: UserCgnModel,
  logPrefix: string = "DeleteCgnActivity"
) => (context: Context, input: unknown): Promise<DeleteCgnActivityResult> => {
  const fail = failure(context, logPrefix);

  return pipe(
    input,
    ActivityInput.decode,
    TE.fromEither,
    TE.mapLeft(errs =>
      fail(errorsToError(errs), "Cannot decode Activity Input")
    ),
    TE.chainW(activityInput =>
      pipe(
        userCgnModel.findAll(activityInput.fiscalCode),
        TE.mapLeft(_ => fail(_, "Cannot retriew all cgn card"))
      )
    ),
    TE.chainW(cards =>
      pipe(
        AR.sequence(TE.ApplicativePar)(
          cards.map(element =>
            userCgnModel.deleteVersion(element.fiscalCode, element.id)
          )
        ),
        TE.bimap(
          _ => fail(_, "Cannot delete cgn version"),
          () => ({
            cards,
            kind: "SUCCESS" as const
          })
        )
      )
    ),
    TE.toUnion
  )();
};
