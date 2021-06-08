import { Context } from "@azure/functions";
import { TableService } from "azure-storage";
import { identity } from "fp-ts/lib/function";
import { fromEither } from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import { ActivityResult, failure, success } from "../utils/activity";
import { errorsToError } from "../utils/conversions";
import { deleteCardExpiration } from "../utils/table_storage";

export const ActivityInput = t.interface({
  fiscalCode: FiscalCode
});

export type ActivityInput = t.TypeOf<typeof ActivityInput>;

/*
 * have to read the expire data first and then have to return this data for bakcup
 */

export const getDeleteCgnExpirationActivityHandler = (
  tableService: TableService,
  cgnExpirationTableName: NonEmptyString,
  logPrefix: string = "DeleteCgnExpirationActivity"
) => (context: Context, input: unknown): Promise<ActivityResult> => {
  const fail = failure(context, logPrefix);
  const deleteCgnExpirationTask = deleteCardExpiration(
    tableService,
    cgnExpirationTableName
  );
  return fromEither(ActivityInput.decode(input))
    .mapLeft(errs => fail(errorsToError(errs), "Cannot decode Activity Input"))
    .chain(activityInput =>
      deleteCgnExpirationTask(
        activityInput.fiscalCode
      ).bimap(err => fail(err, "Cannot delete CGN expiration tuple"), success)
    )
    .fold<ActivityResult>(identity, identity)
    .run();
};
