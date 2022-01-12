import { Context } from "@azure/functions";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { RetrievedUserCgn, UserCgnModel } from "../models/user_cgn";
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

export const RetrieveLegalDataBackupActivityResultSuccess = t.intersection([
  CommonActivityResultSuccess,
  t.interface({
    cgnCards: t.readonlyArray(RetrievedUserCgn)
  }),
  t.partial({
    eycaCards: t.readonlyArray(RetrievedUserEycaCard)
  })
]);

export type RetrieveLegalDataBackupActivityResultSuccess = t.TypeOf<
  typeof RetrieveLegalDataBackupActivityResultSuccess
>;

export const RetrieveLegalDataBackupActivityResult = t.taggedUnion("kind", [
  RetrieveLegalDataBackupActivityResultSuccess,
  ActivityResultFailure
]);

export type RetrieveLegalDataBackupActivityResult = t.TypeOf<
  typeof RetrieveLegalDataBackupActivityResult
>;

export const getRetrieveLegalDataBackupActivityHandler = (
  userCgnModel: UserCgnModel,
  userEycaModel: UserEycaCardModel,
  logPrefix: string = "RetrieveLegalDataBackupActivity"
) => (
  context: Context,
  input: unknown
): Promise<RetrieveLegalDataBackupActivityResult> => {
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
        userCgnModel.findAll(activityInput.fiscalCode),
        TE.mapLeft(_ => fail(_, "Cannot retrieve all cgn cards")),
        TE.chain(cgnCards =>
          pipe(
            userEycaModel.findAll(activityInput.fiscalCode),
            TE.mapLeft(_ => fail(_, "Cannot retrieve all eyca cards")),
            TE.map(eycaCards => ({
              cgnCards,
              eycaCards,
              kind: "SUCCESS" as const
            }))
          )
        )
      )
    ),
    TE.toUnion
  )();
};
