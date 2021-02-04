import { TableService, TableUtilities } from "azure-storage";
import * as date_fns from "date-fns";
import { TaskEither } from "fp-ts/lib/TaskEither";
import { taskify } from "fp-ts/lib/TaskEither";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";

const eg = TableUtilities.entityGenerator;

export const insertCgnExpiration = (
  tableService: TableService,
  cgnExpirationTableName: NonEmptyString
) => (
  fiscalCode: FiscalCode,
  expirationDate: Date
): TaskEither<Error, TableService.EntityMetadata> =>
  taskify<Error, TableService.EntityMetadata>(cb =>
    tableService.insertOrReplaceEntity(
      cgnExpirationTableName,
      {
        PartitionKey: eg.String(date_fns.format(expirationDate, "yyyy-MM-dd")),
        RowKey: eg.String(fiscalCode)
      },
      cb
    )
  )();
