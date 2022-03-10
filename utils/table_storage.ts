import {
  ServiceResponse,
  TableQuery,
  TableService,
  TableUtilities
} from "azure-storage";

import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";

import * as date_fns from "date-fns";
import { pipe } from "fp-ts/lib/function";
import { Timestamp } from "../generated/definitions/Timestamp";

/**
 * A minimal Youth Card storage table Entry
 */
export type TableEntry = Readonly<{
  readonly RowKey: Readonly<{
    readonly _: FiscalCode;
  }>;
  readonly ActivationDate: Readonly<{
    readonly _: Timestamp;
  }>;
  readonly ExpirationDate: Readonly<{
    readonly _: Timestamp;
  }>;
}>;

/**
 * A function that returns a page of query results given a pagination token
 *
 * @see https://docs.microsoft.com/en-us/rest/api/storageservices/query-timeout-and-pagination
 */
export type PagedQuery = (
  currentToken: TableService.TableContinuationToken
) => Promise<E.Either<Error, TableService.QueryEntitiesResult<TableEntry>>>;

/**
 * Returns a paged query function for a certain query on a storage table
 */
export const getPagedQuery = (tableService: TableService, table: string) => (
  tableQuery: TableQuery
): PagedQuery => (
  currentToken
): Promise<E.Either<Error, TableService.QueryEntitiesResult<TableEntry>>> =>
  new Promise(resolve =>
    tableService.queryEntities(
      table,
      tableQuery,
      currentToken,
      (
        error: Error,
        result: TableService.QueryEntitiesResult<TableEntry>,
        response: ServiceResponse
      ) => resolve(response.isSuccessful ? E.right(result) : E.left(error))
    )
  );

/**
 * Iterates over all pages of entries returned by the provided paged query
 * function.
 *
 * @throws Exception on query failure
 */
export async function* iterateOnPages(
  pagedQuery: PagedQuery
): AsyncIterableIterator<ReadonlyArray<TableEntry>> {
  // eslint-disable-next-line functional/no-let
  let token = (undefined as unknown) as TableService.TableContinuationToken;
  do {
    // query for a page of entries
    const errorOrResults = await pagedQuery(token);
    if (E.isLeft(errorOrResults)) {
      // throw an exception in case of error
      throw errorOrResults.left;
    }
    // call the async callback with the current page of entries
    const results = errorOrResults.right;
    yield results.entries;
    // update the continuation token, the loop will continue until
    // the token is defined
    token = pipe(
      results.continuationToken,
      O.fromNullable,
      O.getOrElse(
        () => (undefined as unknown) as TableService.TableContinuationToken
      )
    );
  } while (token !== undefined && token !== null);
}

/**
 * Returns a query filter to get the RowKey(s) for all entries that have the
 * provided partition key
 */
export const queryFilterForKey = (partitionKey: string): TableQuery =>
  new TableQuery()
    .select("RowKey", "ActivationDate", "ExpirationDate")
    .where("PartitionKey == ?", partitionKey);

/**
 * Store a card expiration into `cardExpirationTableName` table
 */
export const insertCardExpiration = (
  tableService: TableService,
  cardExpirationTableName: NonEmptyString
) => (
  fiscalCode: FiscalCode,
  activationDate: Date,
  expirationDate: Date
): TE.TaskEither<Error, TableService.EntityMetadata> => {
  const eg = TableUtilities.entityGenerator;
  return TE.taskify<Error, TableService.EntityMetadata>(cb =>
    tableService.insertOrReplaceEntity(
      cardExpirationTableName,
      {
        ActivationDate: eg.DateTime(activationDate),
        ExpirationDate: eg.DateTime(expirationDate),
        PartitionKey: eg.String(date_fns.format(expirationDate, "yyyy-MM-dd")),
        RowKey: eg.String(fiscalCode)
      },
      cb
    )
  )();
};

/**
 * Delete a card expiration into `cardExpirationTableName` table
 */
export const deleteCardExpiration = (
  tableService: TableService,
  cardExpirationTableName: NonEmptyString
) => (
  fiscalCode: FiscalCode,
  expirationDate: Date
): TE.TaskEither<Error, ServiceResponse> => {
  const eg = TableUtilities.entityGenerator;
  return TE.tryCatch(
    () =>
      new Promise((resolve, reject) =>
        tableService.deleteEntity(
          cardExpirationTableName,
          {
            PartitionKey: eg.String(
              date_fns.format(expirationDate, "yyyy-MM-dd")
            ),
            RowKey: eg.String(fiscalCode)
          },
          (error: Error | null, response: ServiceResponse | null) =>
            (error || !response?.isSuccessful) && response?.statusCode !== 404
              ? reject(error?.message || "Unsuccessful response from storage")
              : resolve(response)
        )
      ),
    E.toError
  );
};
