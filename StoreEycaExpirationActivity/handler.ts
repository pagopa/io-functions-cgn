import { Context } from "@azure/functions";
import { TableService } from "azure-storage";
import { identity } from "fp-ts/lib/function";
import { fromEither } from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import { Timestamp } from "../generated/definitions/Timestamp";
import { ActivityResult, failure, success } from "../utils/activity";
import { errorsToError } from "../utils/conversions";
import { insertCardExpiration } from "../utils/table_storage";

export const ActivityInput = t.interface({
  activationDate: Timestamp,
  expirationDate: Timestamp,
  fiscalCode: FiscalCode
});

export type ActivityInput = t.TypeOf<typeof ActivityInput>;

export const getStoreEycaExpirationActivityHandler = (
  tableService: TableService,
  eycaExpirationTableName: NonEmptyString,
  logPrefix: string = "StoreEycaExpirationActivity"
) => (context: Context, input: unknown): Promise<ActivityResult> => {
  const fail = failure(context, logPrefix);
  const insertEycaExpirationTask = insertCardExpiration(
    tableService,
    eycaExpirationTableName
  );
  return fromEither(ActivityInput.decode(input))
    .mapLeft(errs => fail(errorsToError(errs), "Cannot decode Activity Input"))
    .chain(activityInput =>
      insertEycaExpirationTask(
        activityInput.fiscalCode,
        activityInput.activationDate,
        activityInput.expirationDate
      ).bimap(err => fail(err, "Cannot insert Eyca expiration tuple"), success)
    )
    .fold<ActivityResult>(identity, identity)
    .run();
};
