import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { BlobService } from "azure-storage";
import * as t from "io-ts";
import { TaskEither, taskify } from "fp-ts/lib/TaskEither";

export const BlobCreationFailure = t.interface({
  kind: t.literal("BLOB_FAILURE"),
  reason: t.string
});
export type BlobCreationFailure = t.TypeOf<typeof BlobCreationFailure>;


/**
 * Saves data into a dedicated blob
 *
 * @param blobServiceInfo references about where to save data
 * @param blobName name of the blob to be saved. It might not include a folder if specified in blobServiceInfo
 * @param data serializable data to be saved
 *
 * @returns either a blob failure or the saved object
 */
export const saveDataToBlob = <T>(
  blobService: BlobService,
  containerName: NonEmptyString, 
  folder: NonEmptyString,
  blobName: NonEmptyString,
  data: T
): TaskEither<BlobCreationFailure, T> =>
  taskify<Error, BlobService.BlobResult>(cb =>
    blobService.createBlockBlobFromText(
      containerName,
      `${folder}${folder ? "/" : ""}${blobName}`,
      JSON.stringify(data),
      cb
    )
  )().bimap(
    err =>
      BlobCreationFailure.encode({
        kind: "BLOB_FAILURE",
        reason: err.message
      }),
    _ => data
  );
