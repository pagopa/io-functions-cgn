/* tslint:disable: no-any */
import * as date_fns from "date-fns";
import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import { context } from "../../__mocks__/durable-functions";
import { now } from "../../__mocks__/mock";
import * as tableUtils from "../../utils/table_storage";
import {
  ActivityInput,
  getStoreCgnExpirationActivityHandler
} from "../handler";

const aFiscalCode = "RODFDS82S10H501T" as FiscalCode;
const tableServiceMock = jest.fn();
const expiredCgnTableName = "aTable" as NonEmptyString;

const insertCgnExpirationMock = jest.fn();
jest
  .spyOn(tableUtils, "insertCardExpiration")
  .mockImplementation(insertCgnExpirationMock);

const anActivityInput: ActivityInput = {
  activationDate: now,
  expirationDate: date_fns.addYears(now, 5),
  fiscalCode: aFiscalCode
};

describe("StoreCgnExpirationActivity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should return failure if an error occurs during CgnExpiration insert", async () => {
    const storeCgnExpirationActivityHandler = getStoreCgnExpirationActivityHandler(
      tableServiceMock as any,
      expiredCgnTableName
    );

    insertCgnExpirationMock.mockImplementationOnce(_ =>
      jest.fn(() => fromLeft(new Error("Entity Error")))
    );
    const response = await storeCgnExpirationActivityHandler(
      context,
      anActivityInput
    );
    expect(response.kind).toBe("FAILURE");
  });

  it("should return success if a CgnExpiration's insert succeded", async () => {
    const storeCgnExpirationActivityHandler = getStoreCgnExpirationActivityHandler(
      tableServiceMock as any,
      expiredCgnTableName
    );

    insertCgnExpirationMock.mockImplementationOnce(_ =>
      jest.fn(() => taskEither.of({}))
    );
    const response = await storeCgnExpirationActivityHandler(
      context,
      anActivityInput
    );
    expect(response.kind).toBe("SUCCESS");
  });
});
