import { Context } from "@azure/functions";
import { TableService } from "azure-storage";
import { flow, pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { ActivityResult, success } from "../utils/activity";
import { errorsToError } from "../utils/conversions";
import { deleteCardExpiration } from "../utils/table_storage";
import {
  toPermanentFailure,
  toTransientFailure,
  trackFailure
} from "../utils/errors";
import { extractEycaExpirationDate } from "../utils/cgn_checks";

export const ActivityInput = t.interface({
  fiscalCode: FiscalCode
});

export type ActivityInput = t.TypeOf<typeof ActivityInput>;

/*
 * have to read the expire data first and then have to return this data for bakcup
 */

export const getDeleteEycaExpirationActivityHandler = (
  tableService: TableService,
  eycaExpirationTableName: NonEmptyString,
  eycaUpperBoundAge: NonNegativeInteger,
  logPrefix: string = "DeleteEycaExpirationActivity"
) => (context: Context, input: unknown): Promise<ActivityResult> => {
  const fail = trackFailure(context, logPrefix);
  const deleteEycaExpirationTask = deleteCardExpiration(
    tableService,
    eycaExpirationTableName
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
        extractEycaExpirationDate(activityInput.fiscalCode, eycaUpperBoundAge),
        TE.fromEither,
        TE.mapLeft(e =>
          toPermanentFailure(e, "Cannot extract EYCA expirationDate")
        ),
        TE.chain(expirationDate =>
          pipe(
            deleteEycaExpirationTask(activityInput.fiscalCode, expirationDate),
            TE.mapLeft(err =>
              toTransientFailure(err, "Cannot delete EYCA expiration tuple")
            )
          )
        )
      )
    ),
    TE.bimap(fail, success),
    TE.toUnion
  )();
};
