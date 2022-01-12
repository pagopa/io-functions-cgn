/* tslint:disable: no-any */
import { BlobService } from "azure-storage";
import * as date_fns from "date-fns";
import * as TE from "fp-ts/lib/TaskEither";
import { CosmosResource } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { context } from "../../__mocks__/durable-functions";
import { now } from "../../__mocks__/mock";
import { StatusEnum as ActivatedStatusEnum } from "../../generated/definitions/CardActivated";
import { RetrievedUserCgn } from "../../models/user_cgn";
import {
  ActivityInput,
  getDeleteLegalDataBackupActivityHandler
} from "../handler";
import * as blobUtils from "../utils";
import { BlobCreationFailure } from "../utils";

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
  card: {
    activation_date: now,
    expiration_date: date_fns.addDays(now, 10),
    status: ActivatedStatusEnum.ACTIVATED
  },
  fiscalCode: aFiscalCode,
  id: "123" as NonEmptyString,
  kind: "IRetrievedUserCgn",
  version: 0 as NonNegativeInteger
};
const anArrayOfCardResults: ReadonlyArray<RetrievedUserCgn> = [anActivatedCgn];

const legalDataToBackup: ActivityInput = {
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
      TE.left(
        BlobCreationFailure.encode({
          kind: "BLOB_FAILURE",
          reason: "Blob failure test"
        })
      )
    );

    const response = await deleteLegalDataBackupActivityHandler(
      context,
      legalDataToBackup
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

    saveDataToBlobMock.mockImplementationOnce(() => TE.of(legalDataToBackup));

    const response = await deleteLegalDataBackupActivityHandler(
      context,
      legalDataToBackup
    );

    expect(response.kind).toBe("SUCCESS");
  });
});
