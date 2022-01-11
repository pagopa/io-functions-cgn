/* eslint-disable @typescript-eslint/no-explicit-any */
import * as TE from "fp-ts/lib/TaskEither";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { context } from "../../__mocks__/durable-functions";
import * as tableUtils from "../../utils/table_storage";
import {
  ActivityInput,
  getDeleteEycaExpirationActivityHandler
} from "../handler";

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
  it("should return failure if an error occurs during EycaExpiration delete", async () => {
    const deleteEycaExpirationActivityHandler = getDeleteEycaExpirationActivityHandler(
      tableServiceMock as any,
      expiredEycaTableName
    );

    deleteEycaExpirationMock.mockImplementationOnce(_ =>
      jest.fn(() => TE.left(new Error("Entity Error")))
    );
    const response = await deleteEycaExpirationActivityHandler(
      context,
      anActivityInput
    );
    expect(response.kind).toBe("FAILURE");
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
