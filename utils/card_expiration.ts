import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { TableService } from "azure-storage";
import { toError } from "fp-ts/lib/Either";
import { taskEither, tryCatch } from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { Timestamp } from "../generated/definitions/Timestamp";
import {
  getPagedQuery,
  iterateOnPages,
  PagedQuery,
  queryFilterForKey,
  TableEntry
} from "../utils/table_storage";

const ExpiredCardRowKey = t.interface({
  activationDate: Timestamp,
  expirationDate: Timestamp,
  fiscalCode: FiscalCode
});

export type ExpiredCardRowKey = t.TypeOf<typeof ExpiredCardRowKey>;

/**
 * Do something with the user hash extracted from the table entry
 */
const withExpiredCardRowFromEntry = (f: (s: ExpiredCardRowKey) => void) => (
  e: TableEntry
): void =>
  f({
    activationDate: e.ActivationDate._,
    expirationDate: e.ExpirationDate._,
    fiscalCode: e.RowKey._
  });

/**
 * Fetches all user hashed returned by the provided paged query
 */
export async function queryUsers(
  pagedQuery: PagedQuery
): Promise<ReadonlySet<ExpiredCardRowKey>> {
  const entries = new Set<ExpiredCardRowKey>();
  const addToSet = withExpiredCardRowFromEntry(s => entries.add(s));
  for await (const page of iterateOnPages(pagedQuery)) {
    page.forEach(addToSet);
  }
  return entries;
}

export const getExpiredCardUsers = (
  tableService: TableService,
  expiredCardTableName: string,
  refDate: string
) =>
  // get a function that can query the expired cgns table
  taskEither
    .of<Error, ReturnType<typeof getPagedQuery>>(
      getPagedQuery(tableService, expiredCardTableName)
    )
    .map(pagedQuery => pagedQuery(queryFilterForKey(`${refDate}`)))
    .chain(cgnExpirationQuery =>
      tryCatch(() => queryUsers(cgnExpirationQuery), toError).map(readSet =>
        Array.from(readSet.values())
      )
    );
