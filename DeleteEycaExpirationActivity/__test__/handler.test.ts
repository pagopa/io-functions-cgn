/* eslint-disable @typescript-eslint/no-explicit-any */
import * as TE from "fp-ts/lib/TaskEither";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { pipe } from "fp-ts/lib/function";
import { toError } from "fp-ts/lib/Either";
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

describe("DeleteEycaExpirationActivity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should throw if an error occurs during EycaExpiration delete", async () => {
    const deleteEycaExpirationActivityHandler = getDeleteEycaExpirationActivityHandler(
      tableServiceMock as any,
      expiredEycaTableName
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

  it("should return success if a delete of EycaExpiration succeded", async () => {
    const deleteEycaExpirationActivityHandler = getDeleteEycaExpirationActivityHandler(
      tableServiceMock as any,
      expiredEycaTableName
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
