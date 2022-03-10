// eslint-disable @typescript-eslint/no-explicit-any

import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import { deleteCardExpiration, insertCardExpiration } from "../table_storage";
import { aFiscalCode, now } from "../../__mocks__/mock";

const aCardExpirationTableName = "TableName" as NonEmptyString;

const aSuccessfulServiceResponse = {
  isSuccessful: true,
  statusCode: 200
};

const aNotFoundServiceResponse = {
  isSuccessful: false,
  statusCode: 404
};

const anErrorServiceResponse = {
  isSuccessful: false,
  statusCode: 500
};
const deleteEntityMock = jest
  .fn()
  .mockImplementation((_, __, cb) => cb(null, aSuccessfulServiceResponse));

const insertOrReplaceEntityMock = jest
  .fn()
  .mockImplementation((_, __, cb) => cb(null, {}));
const tableStorageMock = {
  deleteEntity: deleteEntityMock,
  insertOrReplaceEntity: insertOrReplaceEntityMock
} as any;

describe("deleteCardExpiration", () => {
  it("should return a success response if delete succeed", async () => {
    const deleteExpirationTask = deleteCardExpiration(
      tableStorageMock,
      aCardExpirationTableName
    );
    await pipe(
      deleteExpirationTask(aFiscalCode, now),
      TE.bimap(
        _ => fail(),
        value => expect(value).toEqual(aSuccessfulServiceResponse)
      )
    )();
  });

  it("should return a response if target tuple is not found", async () => {
    deleteEntityMock.mockImplementationOnce((_, __, cb) =>
      cb(null, aNotFoundServiceResponse)
    );
    const deleteExpirationTask = deleteCardExpiration(
      tableStorageMock,
      aCardExpirationTableName
    );
    await pipe(
      deleteExpirationTask(aFiscalCode, now),
      TE.bimap(
        _ => fail(),
        value => expect(value).toEqual(aNotFoundServiceResponse)
      )
    )();
  });

  it("should return an error if something else fails during delete operation", async () => {
    deleteEntityMock.mockImplementationOnce((_, __, cb) =>
      cb(null, anErrorServiceResponse)
    );
    const deleteExpirationTask = deleteCardExpiration(
      tableStorageMock,
      aCardExpirationTableName
    );
    await pipe(
      deleteExpirationTask(aFiscalCode, now),
      TE.bimap(
        _ => expect(_).toBeDefined(),
        () => fail()
      )
    )();
  });

  it("should return an error if delete operation raise an error", async () => {
    deleteEntityMock.mockImplementationOnce((_, __, cb) =>
      cb(new Error("Cannot delete tuple"), null)
    );
    const deleteExpirationTask = deleteCardExpiration(
      tableStorageMock,
      aCardExpirationTableName
    );
    await pipe(
      deleteExpirationTask(aFiscalCode, now),
      TE.bimap(
        _ => expect(_).toBeDefined(),
        () => fail()
      )
    )();
  });
});

describe("insertCardExpiration", () => {
  it("should return a success response if insert succeed", async () => {
    const insertExpirationTask = insertCardExpiration(
      tableStorageMock,
      aCardExpirationTableName
    );
    await pipe(
      insertExpirationTask(aFiscalCode, now, now),
      TE.bimap(
        _ => fail(),
        value => expect(value).toEqual({})
      )
    )();
  });

  it("should return an error if insert fails", async () => {
    insertOrReplaceEntityMock.mockImplementationOnce((_, __, cb) =>
      cb(new Error("Cannot insert entity"), null)
    );
    const insertExpirationTask = insertCardExpiration(
      tableStorageMock,
      aCardExpirationTableName
    );
    await pipe(
      insertExpirationTask(aFiscalCode, now, now),
      TE.bimap(
        _ => expect(_).toBeDefined(),
        () => fail()
      )
    )();
  });
});
