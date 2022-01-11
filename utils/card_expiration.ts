import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { TableService } from "azure-storage";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
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
export const queryUsers = async (
  pagedQuery: PagedQuery
): Promise<ReadonlySet<ExpiredCardRowKey>> => {
  const entries = new Set<ExpiredCardRowKey>();
  const addToSet = withExpiredCardRowFromEntry(s => entries.add(s));
  for await (const page of iterateOnPages(pagedQuery)) {
    page.forEach(addToSet);
  }
  return entries;
};

export const getExpiredCardUsers = (
  tableService: TableService,
  expiredCardTableName: string,
  refDate: string
): TE.TaskEither<Error, ReadonlyArray<ExpiredCardRowKey>> =>
  // get a function that can query the expired cgns table
  pipe(
    TE.of(getPagedQuery(tableService, expiredCardTableName)),
    TE.map(pagedQuery => pagedQuery(queryFilterForKey(`${refDate}`))),
    TE.chain(cgnExpirationQuery =>
      pipe(
        TE.tryCatch(() => queryUsers(cgnExpirationQuery), E.toError),
        TE.map(readSet => Array.from(readSet.values()))
      )
    )
  );
