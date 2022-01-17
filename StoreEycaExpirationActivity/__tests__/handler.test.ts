/* eslint-disable @typescript-eslint/no-explicit-any */
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as date_fns from "date-fns";
import * as TE from "fp-ts/lib/TaskEither";
import { context } from "../../__mocks__/durable-functions";
import { now, testFail } from "../../__mocks__/mock";
import * as tableUtils from "../../utils/table_storage";
import {
  ActivityInput,
  getStoreEycaExpirationActivityHandler
} from "../handler";
import { pipe } from "fp-ts/lib/function";
import { toError } from "fp-ts/lib/Either";

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

  it("should return a permanent failure if any errors occurs on input decode", async () => {
    const storeEycaExpirationActivityHandler = getStoreEycaExpirationActivityHandler(
      tableServiceMock as any,
      expiredEycaTableName
    );
    const response = await storeEycaExpirationActivityHandler(context, {});
    expect(response.kind).toBe("FAILURE");
  });
  it("should throw if an error occurs during EycaExpiration insert", async () => {
    const storeEycaExpirationActivityHandler = getStoreEycaExpirationActivityHandler(
      tableServiceMock as any,
      expiredEycaTableName
    );

    insertEycaExpirationMock.mockImplementationOnce(_ =>
      jest.fn(() => TE.left(new Error("Entity Error")))
    );
    await pipe(
      TE.tryCatch(
        () => storeEycaExpirationActivityHandler(context, anActivityInput),
        toError
      ),
      TE.bimap(e => {
        expect(e).toBeDefined();
        expect(e.message).toContain("TRANSIENT FAILURE");
      }, testFail)
    )();
  });

  it("should return success if a EycaExpiration's insert succeded", async () => {
    const storeEycaExpirationActivityHandler = getStoreEycaExpirationActivityHandler(
      tableServiceMock as any,
      expiredEycaTableName
    );

    insertEycaExpirationMock.mockImplementationOnce(_ =>
      jest.fn(() => TE.of({}))
    );
    const response = await storeEycaExpirationActivityHandler(
      context,
      anActivityInput
    );
    expect(response.kind).toBe("SUCCESS");
  });
});
