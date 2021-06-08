import { Context } from "@azure/functions";
import { array } from "fp-ts/lib/Array";
import { identity } from "fp-ts/lib/function";
import { fromEither, taskEither } from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { FiscalCode } from "italia-ts-commons/lib/strings";
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

export const DeleteEycaActivityResult = t.taggedUnion("kind", [
  DeleteEycaActivityResultSuccess,
  ActivityResultFailure
]);

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

  return fromEither(ActivityInput.decode(input))
    .mapLeft(errs => fail(errorsToError(errs), "Cannot decode Activity Input"))
    .chain(activityInput =>
      userEycaModel
        .findAll(activityInput.fiscalCode)
        .mapLeft(_ => fail(_, "Cannot retriew all eyca card"))
    )
    .chain(cards =>
      array
        .sequence(taskEither)(
          cards.map(element =>
            userEycaModel.deleteVersion(element.fiscalCode, element.id)
          )
        )
        .mapLeft(_ => fail(_, "Cannot delete eyca version"))
        .map(() => cards)
    )
    .fold<DeleteEycaActivityResult>(identity, cards => ({
      cards,
      kind: "SUCCESS"
    }))
    .run();
};
