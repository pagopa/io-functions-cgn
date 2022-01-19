/* tslint:disable: no-any */
import * as TE from "fp-ts/lib/TaskEither";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { context } from "../../__mocks__/durable-functions";
import { cgnActivatedDates, testFail } from "../../__mocks__/mock";
import { Card } from "../../generated/definitions/Card";
import {
  CardRevoked,
  StatusEnum as RevokedStatusEnum
} from "../../generated/definitions/CardRevoked";
import { ActivityInput, getDeleteCgnActivityHandler } from "../handler";
import { pipe } from "fp-ts/lib/function";
import { toError } from "fp-ts/lib/Either";

const now = new Date();
const aFiscalCode = "RODFDS82S10H501T" as FiscalCode;
const aRevocationRequest = {
  reason: "aMotivation" as NonEmptyString
};

const aUserCardRevoked: CardRevoked = {
  ...cgnActivatedDates,
  revocation_date: now,
  revocation_reason: aRevocationRequest.reason,
  status: RevokedStatusEnum.REVOKED
};
const anArrayOfCardResults: ReadonlyArray<Card> = [aUserCardRevoked];
const findAllMock = jest
  .fn()
  .mockImplementation(() => TE.of(anArrayOfCardResults));
const deleteVersionMock = jest.fn().mockImplementation(() => TE.of("id"));

const userCgnModelMock = {
  deleteVersion: deleteVersionMock,
  findAllCgnCards: findAllMock
};

const anActivityInput: ActivityInput = {
  fiscalCode: aFiscalCode
};
describe("DeleteCgnActivity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should return failure if an error occurs during input decode", async () => {
    const deleteCgnActivityHandler = getDeleteCgnActivityHandler(
      userCgnModelMock as any
    );
    const response = await deleteCgnActivityHandler(context, {} as any);
    expect(response.kind).toBe("FAILURE");
  });

  it("should throw if an error occurs during findAll", async () => {
    findAllMock.mockImplementationOnce(() =>
      TE.left(new Error("Cannot retrieve data"))
    );
    const deleteCgnActivityHandler = getDeleteCgnActivityHandler(
      userCgnModelMock as any
    );
    await pipe(
      TE.tryCatch(
        () => deleteCgnActivityHandler(context, anActivityInput),
        toError
      ),
      TE.bimap(e => {
        expect(findAllMock).toBeCalledTimes(1);
        expect(findAllMock).toBeCalledWith(anActivityInput.fiscalCode);
        expect(e).toBeDefined();
        expect(e.message).toContain(
          "TRANSIENT FAILURE|ERROR=Cannot retrieve all cgn card"
        );
      }, testFail)
    )();
  });

  it("should throw if an error occurs during deleteVersion", async () => {
    findAllMock.mockImplementationOnce(() =>
      TE.of([...anArrayOfCardResults, anArrayOfCardResults])
    );
    deleteVersionMock.mockImplementationOnce(() =>
      TE.left(new Error("Cannot delete version"))
    );
    const deleteCgnActivityHandler = getDeleteCgnActivityHandler(
      userCgnModelMock as any
    );
    await pipe(
      TE.tryCatch(
        () => deleteCgnActivityHandler(context, anActivityInput),
        toError
      ),
      TE.bimap(e => {
        expect(findAllMock).toBeCalledTimes(1);
        expect(findAllMock).toBeCalledWith(anActivityInput.fiscalCode);
        expect(deleteVersionMock).toBeCalledTimes(2);
        expect(e).toBeDefined();
        expect(e.message).toContain(
          "TRANSIENT FAILURE|ERROR=Cannot delete cgn version"
        );
      }, testFail)
    )();
  });

  it("should return success if all versions are deleted", async () => {
    const deleteCgnActivityHandler = getDeleteCgnActivityHandler(
      userCgnModelMock as any
    );
    const response = await deleteCgnActivityHandler(context, anActivityInput);
    expect(findAllMock).toBeCalledTimes(1);
    expect(findAllMock).toBeCalledWith(anActivityInput.fiscalCode);
    expect(deleteVersionMock).toBeCalledTimes(1);
    expect(response.kind).toBe("SUCCESS");
  });
});
