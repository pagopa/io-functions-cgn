import { Context } from "@azure/functions";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { TableService } from "azure-storage";
import { flow, pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { Timestamp } from "../generated/definitions/Timestamp";
import { ActivityResult, success } from "../utils/activity";
import { errorsToError } from "../utils/conversions";
import {
  toPermanentFailure,
  toTransientFailure,
  trackFailure
} from "../utils/errors";
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
  const fail = trackFailure(context, logPrefix);
  const insertEycaExpirationTask = insertCardExpiration(
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
        insertEycaExpirationTask(
          activityInput.fiscalCode,
          activityInput.activationDate,
          activityInput.expirationDate
        ),
        TE.bimap(
          err => toTransientFailure(err, "Cannot insert Eyca expiration tuple"),
          success
        )
      )
    ),
    TE.mapLeft(fail),
    TE.toUnion
  )();
};
