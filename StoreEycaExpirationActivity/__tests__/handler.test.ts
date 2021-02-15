/* tslint:disable: no-any */
import * as date_fns from "date-fns";
import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import { context } from "../../__mocks__/durable-functions";
import { now } from "../../__mocks__/mock";
import {
  ActivityInput,
  getStoreEycaExpirationActivityHandler
} from "../handler";
import * as tableUtils from "../../utils/table_storage";

const aFiscalCode = "RODFDS82S10H501T" as FiscalCode;
const tableServiceMock = jest.fn();
const expiredEycaTableName = "aTable" as NonEmptyString;

const insertEycaExpirationMock = jest.fn();
jest
  .spyOn(tableUtils, "insertCardExpiration")
  .mockImplementation(insertEycaExpirationMock);

const anActivityInput: ActivityInput = {
  activationDate: now,
  expirationDate: date_fns.addYears(now, 5),
  fiscalCode: aFiscalCode
};

describe("StoreCgnExpirationActivity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should return failure if an error occurs during EycaExpiration insert", async () => {
    const storeEycaExpirationActivityHandler = getStoreEycaExpirationActivityHandler(
      tableServiceMock as any,
      expiredEycaTableName
    );

    insertEycaExpirationMock.mockImplementationOnce(_ =>
      jest.fn(() => fromLeft(new Error("Entity Error")))
    );
    const response = await storeEycaExpirationActivityHandler(
      context,
      anActivityInput
    );
    expect(response.kind).toBe("FAILURE");
  });

  it("should return success if a EycaExpiration's insert succeded", async () => {
    const storeEycaExpirationActivityHandler = getStoreEycaExpirationActivityHandler(
      tableServiceMock as any,
      expiredEycaTableName
    );

    insertEycaExpirationMock.mockImplementationOnce(_ =>
      jest.fn(() => taskEither.of({}))
    );
    const response = await storeEycaExpirationActivityHandler(
      context,
      anActivityInput
    );
    expect(response.kind).toBe("SUCCESS");
  });
});
