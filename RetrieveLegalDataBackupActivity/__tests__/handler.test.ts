/* tslint:disable: no-any */
import * as TE from "fp-ts/lib/TaskEither";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { context } from "../../__mocks__/durable-functions";
import { cgnActivatedDates } from "../../__mocks__/mock";
import { Card } from "../../generated/definitions/Card";
import {
  CardRevoked,
  StatusEnum as RevokedStatusEnum
} from "../../generated/definitions/CardRevoked";
import { EycaCardRevoked } from "../../generated/definitions/EycaCardRevoked";
import { CcdbNumber } from "../../generated/eyca-api/CcdbNumber";
import {
  ActivityInput,
  getRetrieveLegalDataBackupActivityHandler
} from "../handler";

const now = new Date();
const aFiscalCode = "RODFDS82S10H501T" as FiscalCode;
const aUserEycaCardNumber = "X321-Y321-Z321-W321" as CcdbNumber;

const aRevocationRequest = {
  reason: "aMotivation" as NonEmptyString
};

const aCgnUserCardRevoked: CardRevoked = {
  ...cgnActivatedDates,
  revocation_date: now,
  revocation_reason: aRevocationRequest.reason,
  status: RevokedStatusEnum.REVOKED
};
const anArrayOfCgnCardResults: ReadonlyArray<Card> = [aCgnUserCardRevoked];
const anEycaUserCardRevoked: EycaCardRevoked = {
  ...cgnActivatedDates,
  card_number: aUserEycaCardNumber,
  revocation_date: now,
  revocation_reason: aRevocationRequest.reason,
  status: RevokedStatusEnum.REVOKED
};
const anArrayOfEycaCardResults: ReadonlyArray<Card> = [anEycaUserCardRevoked];

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

const anActivityInput: ActivityInput = {
  fiscalCode: aFiscalCode
};

describe("DeleteEycaActivity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should return failure if an error occurs during input decoding", async () => {
    const activityHandler = getRetrieveLegalDataBackupActivityHandler(
      userCgnModelMock as any,
      userEycaModelMock as any
    );
    const response = await activityHandler(context, {} as any);
    expect(response.kind).toBe("FAILURE");
  });

  it("should return failure if an error occurs during CGN findAll", async () => {
    cgnFindAllMock.mockImplementationOnce(() =>
      TE.left(new Error("Cannot retrieve data"))
    );
    const activityHandler = getRetrieveLegalDataBackupActivityHandler(
      userCgnModelMock as any,
      userEycaModelMock as any
    );
    const response = await activityHandler(context, anActivityInput);
    expect(cgnFindAllMock).toBeCalledTimes(1);
    expect(cgnFindAllMock).toBeCalledWith(anActivityInput.fiscalCode);
    expect(response.kind).toBe("FAILURE");
    if (response.kind === "FAILURE") {
      expect(response.reason).toEqual("Cannot retrieve data");
    }
  });

  it("should return failure if an error occurs during EYCA findAll", async () => {
    eycaFindAllMock.mockImplementationOnce(() =>
      TE.left(new Error("Cannot retrieve data"))
    );
    const activityHandler = getRetrieveLegalDataBackupActivityHandler(
      userCgnModelMock as any,
      userEycaModelMock as any
    );
    const response = await activityHandler(context, anActivityInput);
    expect(cgnFindAllMock).toBeCalledTimes(1);
    expect(cgnFindAllMock).toBeCalledWith(anActivityInput.fiscalCode);
    expect(eycaFindAllMock).toBeCalledTimes(1);
    expect(eycaFindAllMock).toBeCalledWith(anActivityInput.fiscalCode);
    expect(response.kind).toBe("FAILURE");
    if (response.kind === "FAILURE") {
      expect(response.reason).toEqual("Cannot retrieve data");
    }
  });

  it("should return success if all cards are retrieved", async () => {
    const activityHandler = getRetrieveLegalDataBackupActivityHandler(
      userCgnModelMock as any,
      userEycaModelMock as any
    );
    const response = await activityHandler(context, anActivityInput);
    expect(cgnFindAllMock).toBeCalledTimes(1);
    expect(cgnFindAllMock).toBeCalledWith(anActivityInput.fiscalCode);
    expect(eycaFindAllMock).toBeCalledTimes(1);
    expect(eycaFindAllMock).toBeCalledWith(anActivityInput.fiscalCode);
    expect(response.kind).toBe("SUCCESS");
    if (response.kind === "SUCCESS") {
      expect(response.cgnCards).toEqual(anArrayOfCgnCardResults);
      expect(response.eycaCards).toEqual(anArrayOfEycaCardResults);
    }
  });
});
