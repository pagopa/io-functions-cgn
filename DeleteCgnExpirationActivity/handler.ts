import { Context } from "@azure/functions";
import { TableService } from "azure-storage";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { ActivityResult, failure, success } from "../utils/activity";
import { errorsToError } from "../utils/conversions";
import { deleteCardExpiration } from "../utils/table_storage";

export const ActivityInput = t.interface({
  fiscalCode: FiscalCode
});

export type ActivityInput = t.TypeOf<typeof ActivityInput>;

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
  return pipe(
    input,
    ActivityInput.decode,
    TE.fromEither,
    TE.mapLeft(errs =>
      fail(errorsToError(errs), "Cannot decode Activity Input")
    ),
    TE.chain(activityInput =>
      pipe(
        deleteCgnExpirationTask(activityInput.fiscalCode),
        TE.bimap(
          err => fail(err, "Cannot delete CGN expiration tuple"),
          success
        )
      )
    ),
    TE.toUnion
  )();
};
