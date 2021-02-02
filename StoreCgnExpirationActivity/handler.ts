import { Context } from "@azure/functions";
import { TableService, TableUtilities } from "azure-storage";
import * as date_fns from "date-fns";
import { identity } from "fp-ts/lib/function";
import { fromEither } from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import { Timestamp } from "../generated/definitions/Timestamp";
import { errorsToError } from "../utils/conversions";
import { insertCgnExpiration } from "./table";

export const ActivityInput = t.interface({
  expirationDate: Timestamp,
  fiscalCode: FiscalCode
});

export type ActivityInput = t.TypeOf<typeof ActivityInput>;

// Activity result
const ActivityResultSuccess = t.interface({
  kind: t.literal("SUCCESS")
});

type ActivityResultSuccess = t.TypeOf<typeof ActivityResultSuccess>;

const ActivityResultFailure = t.interface({
  kind: t.literal("FAILURE"),
  reason: t.string
});

type ActivityResultFailure = t.TypeOf<typeof ActivityResultFailure>;

export const ActivityResult = t.taggedUnion("kind", [
  ActivityResultSuccess,
  ActivityResultFailure
]);

export type ActivityResult = t.TypeOf<typeof ActivityResult>;

const failure = (context: Context, logPrefix: string) => (
  err: Error,
  description: string = ""
) => {
  const logMessage =
    description === ""
      ? `${logPrefix}|FAILURE=${err.message}`
      : `${logPrefix}|${description}|FAILURE=${err.message}`;
  context.log.info(logMessage);
  return ActivityResultFailure.encode({
    kind: "FAILURE",
    reason: err.message
  });
};

const success = () =>
  ActivityResultSuccess.encode({
    kind: "SUCCESS"
  });

const eg = TableUtilities.entityGenerator;

export const getStoreCgnExpirationActivityHandler = (
  tableService: TableService,
  cgnExpirationTableName: NonEmptyString,
  logPrefix: string = "StoreCgnExpirationActivity"
) => (context: Context, input: unknown): Promise<ActivityResult> => {
  const fail = failure(context, logPrefix);
  const insertCgnExpirationTask = insertCgnExpiration(
    tableService,
    cgnExpirationTableName
  );
  return fromEither(ActivityInput.decode(input))
    .mapLeft(errs => fail(errorsToError(errs), "Cannot decode Activity Input"))
    .chain(activityInput =>
      insertCgnExpirationTask({
        PartitionKey: eg.String(
          date_fns.format(activityInput.expirationDate, "yyyy-MM-dd")
        ),
        RowKey: eg.String(activityInput.fiscalCode)
      }).bimap(err => fail(err, "Cannot insert CGN expiration tuple"), success)
    )
    .fold<ActivityResult>(identity, identity)
    .run();
};
