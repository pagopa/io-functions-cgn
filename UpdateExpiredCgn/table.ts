import { TableService } from "azure-storage";
import { toError } from "fp-ts/lib/Either";
import { taskEither, tryCatch } from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import { Timestamp } from "../generated/definitions/Timestamp";
import {
  getPagedQuery,
  iterateOnPages,
  PagedQuery,
  queryFilterForKey,
  TableEntry
} from "../utils/table_storage";

const ExpiredCgnRowKeyType = t.interface({
  activationDate: Timestamp,
  expirationDate: Timestamp,
  fiscalCode: FiscalCode
});

export type ExpiredCgnRowKeyType = t.TypeOf<typeof ExpiredCgnRowKeyType>;

/**
 * Do something with the user hash extracted from the table entry
 */
const withExpiredCgnRowFromEntry = (f: (s: ExpiredCgnRowKeyType) => void) => (
  e: TableEntry
): void => {
  const rowKey = e.RowKey._;
  // JSON.parse cannot throw cause we are sure rowKey is a valid Json
  return f(JSON.parse(rowKey) as ExpiredCgnRowKeyType);
};

/**
 * Fetches all user hashed returned by the provided paged query
 */
export async function queryUsers(
  pagedQuery: PagedQuery
): Promise<ReadonlySet<ExpiredCgnRowKeyType>> {
  const entries = new Set<ExpiredCgnRowKeyType>();
  const addToSet = withExpiredCgnRowFromEntry(s => entries.add(s));
  for await (const page of iterateOnPages(pagedQuery)) {
    page.forEach(addToSet);
  }
  return entries;
}

export const getExpiredCgnUsers = (
  tableService: TableService,
  expiredCgnTableName: string,
  refDate: string
) =>
  // get a function that can query the expired cgns table
  taskEither
    .of<Error, ReturnType<typeof getPagedQuery>>(
      getPagedQuery(tableService, expiredCgnTableName)
    )
    .map(pagedQuery => pagedQuery(queryFilterForKey(`${refDate}`)))
    .chain(cgnExpirationQuery =>
      tryCatch(() => queryUsers(cgnExpirationQuery), toError).map(readSet =>
        Array.from(readSet.values())
      )
    );
