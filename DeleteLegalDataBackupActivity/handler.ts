import { Context } from "@azure/functions";
import { BlobService } from "azure-storage";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { UserCgnModel } from "../models/user_cgn";
import { UserEycaCardModel } from "../models/user_eyca_card";
import { ActivityResult, failure, success } from "../utils/activity";
import { errorsToError } from "../utils/conversions";
import { saveDataToBlob } from "./utils";

export const ActivityInput = t.interface({
  backupFolder: NonEmptyString,
  fiscalCode: FiscalCode
});
export type ActivityInput = t.TypeOf<typeof ActivityInput>;

export const getDeleteLegalDataBackupActivityHandler = (
  cardsDataBackupBlobService: BlobService,
  cardsDataBackupContainerName: NonEmptyString,
  userCgnModel: UserCgnModel,
  userEycaModel: UserEycaCardModel,
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
        userCgnModel.findAll(activityInput.fiscalCode),
        TE.mapLeft(_ => fail(_, "Cannot retrieve all cgn cards")),
        TE.chain(cgnCards =>
          pipe(
            userEycaModel.findAll(activityInput.fiscalCode),
            TE.mapLeft(_ => fail(_, "Cannot retrieve all eyca cards")),
            TE.map(eycaCards => ({
              cgnCards,
              eycaCards
            }))
          )
        ),
        TE.chainW(retrieveDataOutput =>
          saveDataToBlob(
            cardsDataBackupBlobService,
            cardsDataBackupContainerName,
            activityInput.backupFolder,
            `${activityInput.fiscalCode}.json` as NonEmptyString,
            retrieveDataOutput
          )
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
