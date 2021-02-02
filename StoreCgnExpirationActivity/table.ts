import { TableService } from "azure-storage";
import { TaskEither } from "fp-ts/lib/TaskEither";
import { taskify } from "fp-ts/lib/TaskEither";
import { NonEmptyString } from "italia-ts-commons/lib/strings";

export const insertCgnExpiration = <T>(
  tableService: TableService,
  cgnExpirationTableName: NonEmptyString
) => (entityDescriptor: T): TaskEither<Error, TableService.EntityMetadata> =>
  taskify<Error, TableService.EntityMetadata>(cb =>
    tableService.insertOrReplaceEntity(
      cgnExpirationTableName,
      entityDescriptor,
      cb
    )
  )();
