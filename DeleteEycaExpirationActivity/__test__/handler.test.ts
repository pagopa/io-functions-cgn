/* eslint-disable @typescript-eslint/no-explicit-any */
import * as TE from "fp-ts/lib/TaskEither";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { pipe } from "fp-ts/lib/function";
import { toError } from "fp-ts/lib/Either";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { context } from "../../__mocks__/durable-functions";
import * as tableUtils from "../../utils/table_storage";
import {
  ActivityInput,
  getDeleteEycaExpirationActivityHandler
} from "../handler";
import { testFail } from "../../__mocks__/mock";

const aFiscalCode = "RODFDS82S10H501T" as FiscalCode;
const tableServiceMock = jest.fn();
const expiredEycaTableName = "aTable" as NonEmptyString;

const deleteEycaExpirationMock = jest.fn();
jest
  .spyOn(tableUtils, "deleteCardExpiration")
  .mockImplementation(deleteEycaExpirationMock);

const anActivityInput: ActivityInput = {
  fiscalCode: aFiscalCode
};

const anEycaUpperBoundAge = 30 as NonNegativeInteger;

describe("DeleteEycaExpirationActivity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should throw if an error occurs during EycaExpiration delete", async () => {
    const deleteEycaExpirationActivityHandler = getDeleteEycaExpirationActivityHandler(
      tableServiceMock as any,
      expiredEycaTableName,
      anEycaUpperBoundAge
    );

    deleteEycaExpirationMock.mockImplementationOnce(_ =>
      jest.fn(() => TE.left(new Error("Entity Error")))
    );
    await pipe(
      TE.tryCatch(
        () => deleteEycaExpirationActivityHandler(context, anActivityInput),
        toError
      ),
      TE.bimap(e => {
        expect(e).toBeDefined();
        expect(e.message).toContain(
          "TRANSIENT FAILURE|ERROR=Cannot delete EYCA expiration tuple"
        );
      }, testFail)
    )();
  });

  it("should return a permanent failure if extractExpirationDate fails", async () => {
    const deleteEycaExpirationActivityHandler = getDeleteEycaExpirationActivityHandler(
      tableServiceMock as any,
      expiredEycaTableName,
      anEycaUpperBoundAge
    );

    deleteEycaExpirationMock.mockImplementationOnce(_ =>
      jest.fn(() => TE.of({}))
    );
    const response = await deleteEycaExpirationActivityHandler(context, {
      ...anActivityInput,
      fiscalCode: "RODFDSL2S10H501T" as FiscalCode
    });
    expect(response.kind).toBe("FAILURE");
    if (response.kind === "FAILURE") {
      expect(response.reason).toContain(
        "PERMANENT FAILURE|ERROR=Cannot extract EYCA expirationDate"
      );
    }
  });

  it("should return success if a delete of EycaExpiration succeded", async () => {
    const deleteEycaExpirationActivityHandler = getDeleteEycaExpirationActivityHandler(
      tableServiceMock as any,
      expiredEycaTableName,
      anEycaUpperBoundAge
    );

    deleteEycaExpirationMock.mockImplementationOnce(_ =>
      jest.fn(() => TE.of({}))
    );
    const response = await deleteEycaExpirationActivityHandler(
      context,
      anActivityInput
    );
    expect(response.kind).toBe("SUCCESS");
  });
});
