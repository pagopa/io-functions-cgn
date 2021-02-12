import { ServiceResponse, TableQuery, TableService } from "azure-storage";

import { Either, isLeft, left, right } from "fp-ts/lib/Either";
import { fromNullable } from "fp-ts/lib/Option";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import { Timestamp } from "../generated/definitions/Timestamp";

/**
 * A minimal Youth Card storage table Entry
 */
export type TableEntry = Readonly<{
  RowKey: Readonly<{
    _: FiscalCode;
  }>;
  ActivationDate: Readonly<{
    _: Timestamp;
  }>;
  ExpirationDate: Readonly<{
    _: Timestamp;
  }>;
}>;

/**
 * A function that returns a page of query results given a pagination token
 *
 * @see https://docs.microsoft.com/en-us/rest/api/storageservices/query-timeout-and-pagination
 */
export type PagedQuery = (
  currentToken: TableService.TableContinuationToken
) => Promise<Either<Error, TableService.QueryEntitiesResult<TableEntry>>>;

/**
 * Returns a paged query function for a certain query on a storage table
 */
export const getPagedQuery = (tableService: TableService, table: string) => (
  tableQuery: TableQuery
): PagedQuery => currentToken =>
  new Promise(resolve =>
    tableService.queryEntities(
      table,
      tableQuery,
      currentToken,
      (
        error: Error,
        result: TableService.QueryEntitiesResult<TableEntry>,
        response: ServiceResponse
      ) => resolve(response.isSuccessful ? right(result) : left(error))
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
  // tslint:disable-next-line: no-let
  let token = (undefined as unknown) as TableService.TableContinuationToken;
  do {
    // query for a page of entries
    const errorOrResults = await pagedQuery(token);
    if (isLeft(errorOrResults)) {
      // throw an exception in case of error
      throw errorOrResults.value;
    }
    // call the async callback with the current page of entries
    const results = errorOrResults.value;
    yield results.entries;
    // update the continuation token, the loop will continue until
    // the token is defined
    token = fromNullable(results.continuationToken).getOrElse(
      (undefined as unknown) as TableService.TableContinuationToken
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
