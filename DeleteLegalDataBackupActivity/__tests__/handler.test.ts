/* tslint:disable: no-any */
import * as date_fns from "date-fns";
import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import * as blobUtils from "../utils";
import { now } from "../../__mocks__/mock";
import { BlobService } from "azure-storage";
import {
  ActivityInput,
  getDeleteLegalDataBackupActivityHandler
} from "../handler";
import { context } from "../../__mocks__/durable-functions";
import { BlobCreationFailure } from "../utils";
import { StatusEnum as ActivatedStatusEnum } from "../../generated/definitions/CardActivated";
import { RetrievedUserCgn } from "../../models/user_cgn";
import { CosmosResource } from "io-functions-commons/dist/src/utils/cosmosdb_model";
import { NonNegativeInteger } from "italia-ts-commons/lib/numbers";

// MessageContentBlobService
const messageContentBlobService = ({} as unknown) as BlobService;
const messageContentContainerName = "CGN_BACKUP_DATA" as NonEmptyString;

const aFiscalCode = "RODFDS89S10H501T" as FiscalCode;

const aCosmosResourceMetadata: Omit<CosmosResource, "id"> = {
  _etag: "_etag",
  _rid: "_rid",
  _self: "_self",
  _ts: 1
};

const anActivatedCgn: RetrievedUserCgn = {
  ...aCosmosResourceMetadata,
  id: "123" as NonEmptyString,
  version: 0 as NonNegativeInteger,
  fiscalCode: aFiscalCode,
  card: {
    activation_date: now,
    expiration_date: date_fns.addDays(now, 10),
    status: ActivatedStatusEnum.ACTIVATED
  },
  kind: "IRetrievedUserCgn"
};
const anArrayOfCardResults: ReadonlyArray<RetrievedUserCgn> = [anActivatedCgn];

const legatDataToBackup: ActivityInput = {
  backupFolder: "cgn" as NonEmptyString,
  cgnCards: anArrayOfCardResults,
  fiscalCode: aFiscalCode
};

const saveDataToBlobMock = jest.fn();
jest.spyOn(blobUtils, "saveDataToBlob").mockImplementation(saveDataToBlobMock);

describe("Deleted Card Data to backup to legal reasons", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return a failure if an Activity Input decode fail", async () => {
    const deleteLegalDataBackupActivityHandler = getDeleteLegalDataBackupActivityHandler(
      messageContentBlobService,
      messageContentContainerName
    );

    const response = await deleteLegalDataBackupActivityHandler(
      context,
      {} as any
    );

    expect(response.kind).toBe("FAILURE");
  });

  it("should return a failure a backup data to save fail", async () => {
    const deleteLegalDataBackupActivityHandler = getDeleteLegalDataBackupActivityHandler(
      messageContentBlobService,
      messageContentContainerName
    );

    saveDataToBlobMock.mockImplementationOnce(() =>
      fromLeft(
        BlobCreationFailure.encode({
          kind: "BLOB_FAILURE",
          reason: "Blob failure test"
        })
      )
    );

    const response = await deleteLegalDataBackupActivityHandler(
      context,
      legatDataToBackup
    );

    expect(response.kind).toBe("FAILURE");
    if (response.kind === "FAILURE") {
      expect(response.reason === "Blob failure test");
    }
  });

  it("should return a success after backup saved to blob storage", async () => {
    const deleteLegalDataBackupActivityHandler = getDeleteLegalDataBackupActivityHandler(
      messageContentBlobService,
      messageContentContainerName
    );

    saveDataToBlobMock.mockImplementationOnce(() =>
      taskEither.of(legatDataToBackup)
    );

    const response = await deleteLegalDataBackupActivityHandler(
      context,
      legatDataToBackup
    );

    expect(response.kind).toBe("SUCCESS");
  });
});
