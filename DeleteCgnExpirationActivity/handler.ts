import { Context } from "@azure/functions";
import { TableService } from "azure-storage";
import { flow, pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { ActivityResult, success } from "../utils/activity";
import { errorsToError } from "../utils/conversions";
import { deleteCardExpiration } from "../utils/table_storage";
import {
  toPermanentFailure,
  toTransientFailure,
  trackFailure
} from "../utils/errors";

export const ActivityInput = t.interface({
  fiscalCode: FiscalCode
});

export type ActivityInput = t.TypeOf<typeof ActivityInput>;

export const getDeleteCgnExpirationActivityHandler = (
  tableService: TableService,
  cgnExpirationTableName: NonEmptyString,
  logPrefix: string = "DeleteCgnExpirationActivity"
) => (context: Context, input: unknown): Promise<ActivityResult> => {
  const fail = trackFailure(context, logPrefix);
  const deleteCgnExpirationTask = deleteCardExpiration(
    tableService,
    cgnExpirationTableName
  );
  return pipe(
    input,
    ActivityInput.decode,
    TE.fromEither,
    TE.mapLeft(
      flow(errorsToError, e =>
        toPermanentFailure(e, "Cannot decode Activity Input")
      )
    ),
    TE.chain(activityInput =>
      pipe(
        deleteCgnExpirationTask(activityInput.fiscalCode),
        TE.mapLeft(err =>
          toTransientFailure(err, "Cannot delete CGN expiration tuple")
        )
      )
    ),
    TE.bimap(fail, success),
    TE.toUnion
  )();
};
