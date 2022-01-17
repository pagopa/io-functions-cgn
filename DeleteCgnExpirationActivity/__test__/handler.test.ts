/* eslint-disable @typescript-eslint/no-explicit-any */
import * as TE from "fp-ts/lib/TaskEither";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { toError } from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import { context } from "../../__mocks__/durable-functions";
import * as tableUtils from "../../utils/table_storage";
import {
  ActivityInput,
  getDeleteCgnExpirationActivityHandler
} from "../handler";
import { testFail } from "../../__mocks__/mock";

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
  it("should throw if an error occurs during CgnExpiration delete", async () => {
    const deleteCgnExpirationActivityHandler = getDeleteCgnExpirationActivityHandler(
      tableServiceMock as any,
      expiredCgnTableName
    );

    deleteCardExpirationMock.mockImplementationOnce(_ =>
      jest.fn(() => TE.left(new Error("Entity Error")))
    );
    await pipe(
      TE.tryCatch(
        () => deleteCgnExpirationActivityHandler(context, anActivityInput),
        toError
      ),
      TE.bimap(e => {
        expect(e).toBeDefined();
        expect(e.message).toContain(
          "TRANSIENT FAILURE|ERROR=Cannot delete CGN expiration tuple"
        );
      }, testFail)
    )();
  });

  it("should return success if a CgnExpiration's delete succeded", async () => {
    const storeCgnExpirationActivityHandler = getDeleteCgnExpirationActivityHandler(
      tableServiceMock as any,
      expiredCgnTableName
    );

    deleteCardExpirationMock.mockImplementationOnce(_ =>
      jest.fn(() => TE.of({}))
    );
    const response = await storeCgnExpirationActivityHandler(
      context,
      anActivityInput
    );
    expect(response.kind).toBe("SUCCESS");
  });
});
