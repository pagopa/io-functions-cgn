/* tslint:disable: no-any */
import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import { context } from "../../__mocks__/durable-functions";
import { cgnActivatedDates } from "../../__mocks__/mock";
import { Card } from "../../generated/definitions/Card";
import { EycaCardRevoked } from "../../generated/definitions/EycaCardRevoked";
import { StatusEnum as RevokedStatusEnum } from "../../generated/definitions/CardRevoked";
import { ActivityInput, getDeleteEycaActivityHandler } from "../handler";
import { CcdbNumber } from "../../generated/eyca-api/CcdbNumber";

const now = new Date();
const aFiscalCode = "RODFDS82S10H501T" as FiscalCode;
const aUserEycaCardNumber = "X321-Y321-Z321-W321" as CcdbNumber;

const aRevocationRequest = {
  reason: "aMotivation" as NonEmptyString
};

const aUserCardRevoked: EycaCardRevoked = {
  ...cgnActivatedDates,
  revocation_date: now,
  revocation_reason: aRevocationRequest.reason,
  card_number: aUserEycaCardNumber,
  status: RevokedStatusEnum.REVOKED
};
const anArrayOfCardResults: ReadonlyArray<Card> = [aUserCardRevoked];
const findAllMock = jest
  .fn()
  .mockImplementation(() => taskEither.of(anArrayOfCardResults));
const deleteVersionMock = jest
  .fn()
  .mockImplementation(() => taskEither.of("id"));

const userEycaModelMock = {
  deleteVersion: deleteVersionMock,
  findAll: findAllMock
};

const anActivityInput: ActivityInput = {
  fiscalCode: aFiscalCode
};

describe("DeleteEycaActivity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should return failure if an error occurs during eyca retrieve", async () => {
    const deleteEycaActivityHandler = getDeleteEycaActivityHandler(
      userEycaModelMock as any
    );
    const response = await deleteEycaActivityHandler(context, {} as any);
    expect(response.kind).toBe("FAILURE");
  });

  it("should return failure if an error occurs during findAll", async () => {
    findAllMock.mockImplementationOnce(() =>
      fromLeft(new Error("Cannot retrieve data"))
    );
    const deleteEycaActivityHandler = getDeleteEycaActivityHandler(
      userEycaModelMock as any
    );
    const response = await deleteEycaActivityHandler(context, anActivityInput);
    expect(findAllMock).toBeCalledTimes(1);
    expect(findAllMock).toBeCalledWith(anActivityInput.fiscalCode);
    expect(response.kind).toBe("FAILURE");
    if (response.kind === "FAILURE") {
      expect(response.reason).toEqual("Cannot retrieve data");
    }
  });

  it("should return failure if an error occurs during deleteVersion", async () => {
    findAllMock.mockImplementationOnce(() =>
      taskEither.of([...anArrayOfCardResults, anArrayOfCardResults])
    );
    deleteVersionMock.mockImplementationOnce(() =>
      fromLeft(new Error("Cannot delete version"))
    );
    const deleteEycaActivityHandler = getDeleteEycaActivityHandler(
      userEycaModelMock as any
    );
    const response = await deleteEycaActivityHandler(context, anActivityInput);
    expect(findAllMock).toBeCalledTimes(1);
    expect(findAllMock).toBeCalledWith(anActivityInput.fiscalCode);
    expect(deleteVersionMock).toBeCalledTimes(2);
    expect(response.kind).toBe("FAILURE");
    if (response.kind === "FAILURE") {
      expect(response.reason).toEqual("Cannot delete version");
    }
  });

  it("should return success if all versions are deleted", async () => {
    const deleteEycaActivityHandler = getDeleteEycaActivityHandler(
      userEycaModelMock as any
    );
    const response = await deleteEycaActivityHandler(context, anActivityInput);
    expect(findAllMock).toBeCalledTimes(1);
    expect(findAllMock).toBeCalledWith(anActivityInput.fiscalCode);
    expect(deleteVersionMock).toBeCalledTimes(1);
    expect(response.kind).toBe("SUCCESS");
    if (response.kind === "SUCCESS") {
      expect(response.cards).toEqual(anArrayOfCardResults);
    }
  });
});
