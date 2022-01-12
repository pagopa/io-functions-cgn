import { Context } from "@azure/functions";
import { BlobService } from "azure-storage";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { RetrievedUserCgn } from "../models/user_cgn";
import { RetrievedUserEycaCard } from "../models/user_eyca_card";
import { ActivityResult, failure, success } from "../utils/activity";
import { errorsToError } from "../utils/conversions";
import { saveDataToBlob } from "./utils";

export const ActivityInput = t.intersection([
  t.interface({
    backupFolder: NonEmptyString,
    cgnCards: t.readonlyArray(RetrievedUserCgn),
    fiscalCode: FiscalCode
  }),
  t.partial({
    eycaCards: t.readonlyArray(RetrievedUserEycaCard)
  })
]);
export type ActivityInput = t.TypeOf<typeof ActivityInput>;

export const getDeleteLegalDataBackupActivityHandler = (
  cardsDataBackupBlobService: BlobService,
  cardsDataBackupContainerName: NonEmptyString,
  logPrefix: string = "DeleteLegalDataBackupActivity"
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
        saveDataToBlob(
          cardsDataBackupBlobService,
          cardsDataBackupContainerName,
          activityInput.backupFolder,
          `${activityInput.fiscalCode}.json` as NonEmptyString,
          activityInput
        ),
        TE.bimap(
          err => fail(new Error(err.reason), "Cannot backup CGN data"),
          success
        )
      )
    ),
    TE.toUnion
  )();
};
