/* tslint:disable: no-any */
import { BlobService } from "azure-storage";
import * as date_fns from "date-fns";
import * as TE from "fp-ts/lib/TaskEither";
import { CosmosResource } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { context } from "../../__mocks__/durable-functions";
import { cgnActivatedDates } from "../../__mocks__/mock";
import {
  CardActivated,
  StatusEnum as ActivatedStatusEnum
} from "../../generated/definitions/CardActivated";
import { RetrievedUserCgn } from "../../models/user_cgn";
import {
  ActivityInput,
  getDeleteLegalDataBackupActivityHandler
} from "../handler";
import * as blobUtils from "../utils";
import { BlobCreationFailure } from "../utils";
import { CcdbNumber } from "../../generated/definitions/CcdbNumber";
import {
  CardRevoked,
  StatusEnum as RevokedStatusEnum
} from "../../generated/definitions/CardRevoked";
import { Card } from "../../generated/definitions/Card";
import { EycaCardRevoked } from "../../generated/definitions/EycaCardRevoked";
import { RetrievedUserEycaCard } from "../../models/user_eyca_card";
import { EycaCard } from "../../generated/definitions/EycaCard";

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

const now = new Date();
const aUserEycaCardNumber = "X321-Y321-Z321-W321" as CcdbNumber;

const aRevocationRequest = {
  reason: "aMotivation" as NonEmptyString
};

const commonRetrievedAttributes = {
  ...aCosmosResourceMetadata,
  fiscalCode: aFiscalCode,
  id: "123" as NonEmptyString,
  kind: "IRetrievedUserCgn" as const,
  version: 0 as NonNegativeInteger
};

const anActivatedCgn: CardActivated = {
  ...cgnActivatedDates,
  status: ActivatedStatusEnum.ACTIVATED
};
const aCgnUserCardRevoked: CardRevoked = {
  ...cgnActivatedDates,
  revocation_date: now,
  revocation_reason: aRevocationRequest.reason,
  status: RevokedStatusEnum.REVOKED
};

const wrapCardWithCommonRetrievedAttributes = (card: Card) => ({
  ...commonRetrievedAttributes,
  card
});

const wrapEycaCardWithCommonRetrievedAttributes = (
  card: EycaCard
): RetrievedUserEycaCard => ({
  ...commonRetrievedAttributes,
  kind: "IRetrievedUserEycaCard" as const,
  card
});
const anArrayOfCgnCardResults: ReadonlyArray<RetrievedUserCgn> = [
  wrapCardWithCommonRetrievedAttributes(anActivatedCgn),
  wrapCardWithCommonRetrievedAttributes(aCgnUserCardRevoked)
];
const anEycaUserCardRevoked: EycaCardRevoked = {
  ...cgnActivatedDates,
  card_number: aUserEycaCardNumber,
  revocation_date: now,
  revocation_reason: aRevocationRequest.reason,
  status: RevokedStatusEnum.REVOKED
};
const anArrayOfEycaCardResults: ReadonlyArray<RetrievedUserEycaCard> = [
  wrapEycaCardWithCommonRetrievedAttributes(anEycaUserCardRevoked)
];

const eycaFindAllMock = jest
  .fn()
  .mockImplementation(() => TE.of(anArrayOfEycaCardResults));

const cgnFindAllMock = jest
  .fn()
  .mockImplementation(() => TE.of(anArrayOfCgnCardResults));

const userEycaModelMock = {
  findAll: eycaFindAllMock
};

const userCgnModelMock = {
  findAll: cgnFindAllMock
};

const activityInput: ActivityInput = {
  backupFolder: "cgn" as NonEmptyString,
  fiscalCode: aFiscalCode
};

const saveDataToBlobMock = jest
  .fn()
  .mockImplementation(() => TE.of(activityInput));

jest.spyOn(blobUtils, "saveDataToBlob").mockImplementation(saveDataToBlobMock);

describe("Deleted Card Data to backup to legal reasons", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return a failure if an Activity Input decode fail", async () => {
    const deleteLegalDataBackupActivityHandler = getDeleteLegalDataBackupActivityHandler(
      messageContentBlobService,
      messageContentContainerName,
      userCgnModelMock as any,
      userEycaModelMock as any
    );

    const response = await deleteLegalDataBackupActivityHandler(
      context,
      {} as any
    );

    expect(response.kind).toBe("FAILURE");
  });

  it("should return a failure if a data backup fails", async () => {
    const deleteLegalDataBackupActivityHandler = getDeleteLegalDataBackupActivityHandler(
      messageContentBlobService,
      messageContentContainerName,
      userCgnModelMock as any,
      userEycaModelMock as any
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
      activityInput
    );

    expect(response.kind).toBe("FAILURE");
    if (response.kind === "FAILURE") {
      expect(response.reason).toEqual("Blob failure test");
    }
  });

  it("should return a failure if cgn data retrieve fails", async () => {
    const deleteLegalDataBackupActivityHandler = getDeleteLegalDataBackupActivityHandler(
      messageContentBlobService,
      messageContentContainerName,
      userCgnModelMock as any,
      userEycaModelMock as any
    );

    cgnFindAllMock.mockImplementationOnce(() =>
      TE.left(new Error("Cannot query cgn cards"))
    );

    const response = await deleteLegalDataBackupActivityHandler(
      context,
      activityInput
    );

    expect(response.kind).toBe("FAILURE");
    if (response.kind === "FAILURE") {
      expect(response.reason).toEqual("Cannot query cgn cards");
    }
  });

  it("should return a failure if eyca data retrieve fails", async () => {
    const deleteLegalDataBackupActivityHandler = getDeleteLegalDataBackupActivityHandler(
      messageContentBlobService,
      messageContentContainerName,
      userCgnModelMock as any,
      userEycaModelMock as any
    );

    eycaFindAllMock.mockImplementationOnce(() =>
      TE.left(new Error("Cannot query eyca cards"))
    );

    const response = await deleteLegalDataBackupActivityHandler(
      context,
      activityInput
    );

    expect(response.kind).toBe("FAILURE");
    if (response.kind === "FAILURE") {
      expect(response.reason).toEqual("Cannot query eyca cards");
    }
  });

  it("should return success after backup saved to blob storage", async () => {
    const deleteLegalDataBackupActivityHandler = getDeleteLegalDataBackupActivityHandler(
      messageContentBlobService,
      messageContentContainerName,
      userCgnModelMock as any,
      userEycaModelMock as any
    );

    const response = await deleteLegalDataBackupActivityHandler(
      context,
      activityInput
    );

    expect(response.kind).toBe("SUCCESS");
  });
});
