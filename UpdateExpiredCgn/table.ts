import { TableService } from "azure-storage";
import { array } from "fp-ts/lib/Array";
import { toError } from "fp-ts/lib/Either";
import { taskEither, tryCatch } from "fp-ts/lib/TaskEither";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import {
  getPagedQuery,
  iterateOnPages,
  PagedQuery,
  queryFilterForKey,
  TableEntry
} from "../utils/table_storage";

/**
 * Do something with the user hash extracted from the table entry
 */
const withFiscalCodeFromEntry = (f: (s: FiscalCode) => void) => (
  e: TableEntry
): void => {
  const rowKey = e.RowKey._;
  return f(rowKey as FiscalCode);
};

/**
 * Fetches all user hashed returned by the provided paged query
 */
export async function queryUsers(
  pagedQuery: PagedQuery
): Promise<ReadonlySet<FiscalCode>> {
  const entries = new Set<FiscalCode>();
  const addToSet = withFiscalCodeFromEntry(s => entries.add(s));
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
      tryCatch(() => queryUsers(cgnExpirationQuery), toError)
    );
