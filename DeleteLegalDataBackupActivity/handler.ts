import { Context } from "@azure/functions";
import { BlobService, TableService } from "azure-storage";
import { identity } from "fp-ts/lib/function";
import { fromEither } from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import { ActivityResult, failure, success } from "../utils/activity";
import { errorsToError } from "../utils/conversions";
import { deleteCardExpiration } from "../utils/table_storage";
import { saveDataToBlob } from "./utils";

// `message-status/${item.id}.json`

export const ActivityInput = t.interface({
  backupFolder: NonEmptyString,
  fiscalCode: FiscalCode
});
export type ActivityInput = t.TypeOf<typeof ActivityInput>;

/*
 * have to read the expire data first and then have to return this data for bakcup
 */

export const getDeleteLegalDataBackupActivityHandler = (
  cardsDataBackupBlobService: BlobService,
  cardsDataBackupContainerName: NonEmptyString,
  logPrefix: string = "DeleteLegalDataBackupActivity"
) => (context: Context, input: unknown): Promise<ActivityResult> => {
  const fail = failure(context, logPrefix);

  return fromEither(ActivityInput.decode(input))
    .mapLeft(errs => fail(errorsToError(errs), "Cannot decode Activity Input"))
    .chain(activityInput =>
      saveDataToBlob(
        cardsDataBackupBlobService,
        cardsDataBackupContainerName,
        activityInput.backupFolder,
        "${fiscalCode}.json"
      ).bimap(err => fail(err, "Cannot delete CGN expiration tuple"), success)
    )
    .fold<ActivityResult>(identity, identity)
    .run();
};
