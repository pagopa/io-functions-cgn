/* tslint:disable: no-any */
import * as date_fns from "date-fns";
import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import { context } from "../../__mocks__/durable-functions";
import { now } from "../../__mocks__/mock";
import * as tableUtils from "../../utils/table_storage";
import {
  ActivityInput,
  getDeleteCgnExpirationActivityHandler
} from "../handler";

const aFiscalCode = "RODFDS82S10H501T" as FiscalCode;
const tableServiceMock = jest.fn();
const expiredCgnTableName = "aTable" as NonEmptyString;

const deleteCardExpirationMock = jest.fn();
jest
  .spyOn(tableUtils, "deleteCardExpiration")
  .mockImplementation(deleteCardExpirationMock);

const anActivityInput: ActivityInput = {
  fiscalCode: aFiscalCode
};

describe("DeleteCgnExpirationActivity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should return failure if an error occurs during CgnExpiration delete", async () => {
    const deleteCgnExpirationActivityHandler = getDeleteCgnExpirationActivityHandler(
      tableServiceMock as any,
      expiredCgnTableName
    );

    deleteCardExpirationMock.mockImplementationOnce(_ =>
      jest.fn(() => fromLeft(new Error("Entity Error")))
    );
    const response = await deleteCgnExpirationActivityHandler(
      context,
      anActivityInput
    );
    expect(response.kind).toBe("FAILURE");
  });

  it("should return success if a CgnExpiration's delete succeded", async () => {
    const storeCgnExpirationActivityHandler = getDeleteCgnExpirationActivityHandler(
      tableServiceMock as any,
      expiredCgnTableName
    );

    deleteCardExpirationMock.mockImplementationOnce(_ =>
      jest.fn(() => taskEither.of({}))
    );
    const response = await storeCgnExpirationActivityHandler(
      context,
      anActivityInput
    );
    expect(response.kind).toBe("SUCCESS");
  });
});
