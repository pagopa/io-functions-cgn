import { IOrchestrationFunctionContext } from "durable-functions/lib/src/classes";

import { addSeconds } from "date-fns";
import * as E from "fp-ts/lib/Either";
import * as t from "io-ts";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { pipe } from "fp-ts/lib/function";
import { ActivityInput as DeleteCgnActivityInput } from "../DeleteCgnActivity/handler";
import { ActivityInput as DeleteCgnExpirationActivityInput } from "../DeleteCgnExpirationActivity/handler";
import { ActivityInput as DeleteEycaActivityInput } from "../DeleteEycaActivity/handler";
import { ActivityInput as DeleteEycaExpirationActivityInput } from "../DeleteEycaExpirationActivity/handler";
import { ActivityInput as DeleteEycaRemoteActivityInput } from "../DeleteEycaRemoteActivity/handler";
import { ActivityInput as DeleteLegalDataBackupActivityInput } from "../DeleteLegalDataBackupActivity/handler";
import {
  ActivityInput as RetrieveLegalDataBackupActivityInput,
  RetrieveLegalDataBackupActivityResult
} from "../RetrieveLegalDataBackupActivity/handler";
import { CcdbNumber } from "../generated/definitions/CcdbNumber";
import { ActivityInput as SendMessageActivityInput } from "../SendMessageActivity/handler";
import { ActivityResult } from "../utils/activity";
import { getErrorMessage, MESSAGES } from "../utils/messages";
import {
  getTrackExceptionAndThrowWithErrorStatus,
  trackEventIfNotReplaying,
  trackExceptionAndThrow,
  trackExceptionIfNotReplaying
} from "../utils/orchestrators";
import { internalRetryOptions } from "../utils/retry_policies";

export const OrchestratorInput = t.intersection([
  t.interface({
    fiscalCode: FiscalCode
  }),
  t.partial({
    eycaCardNumber: CcdbNumber
  })
]);
export type OrchestratorInput = t.TypeOf<typeof OrchestratorInput>;

const NOTIFICATION_DELAY_SECONDS = 10;

// tslint:disable-next-line: no-big-function
// eslint-disable-next-line max-lines-per-function
export const DeleteCgnOrchestratorHandler = function*(
  context: IOrchestrationFunctionContext,
  logPrefix: string = "DeleteCgnOrchestrator"
): Generator {
  const trackExAndThrow = trackExceptionAndThrow(context, logPrefix);
  const trackExAndThrowWithError = getTrackExceptionAndThrowWithErrorStatus(
    context,
    logPrefix
  );
  const trackExIfNotReplaying = trackExceptionIfNotReplaying(context);
  const trackEvtIfNotReplaying = trackEventIfNotReplaying(context);
  if (!context.df.isReplaying) {
    context.df.setCustomStatus("RUNNING");
  }

  const input = context.df.getInput();
  const decodedInput = pipe(
    input,
    OrchestratorInput.decode,
    E.getOrElseW(e => trackExAndThrow(e, "cgn.delete.exception.decode.input"))
  );

  const { fiscalCode, eycaCardNumber } = decodedInput;
  const tagOverrides = {
    "ai.operation.id": fiscalCode,
    "ai.operation.parentId": fiscalCode
  };

  try {
    try {
      // First get legal data backup without deleting them
      const retrieveLegalDataBackupResult = yield context.df.callActivityWithRetry(
        "RetrieveLegalDataBackupActivity",
        internalRetryOptions,
        RetrieveLegalDataBackupActivityInput.encode({
          fiscalCode
        })
      );
      const decodedRetrieveLegalDataBackupResult = pipe(
        retrieveLegalDataBackupResult,
        RetrieveLegalDataBackupActivityResult.decode,
        E.getOrElseW(e =>
          trackExAndThrowWithError(
            e,
            "cgn.delete.exception.decode.retrieveLegalDataBackup"
          )
        )
      );
      if (decodedRetrieveLegalDataBackupResult.kind !== "SUCCESS") {
        trackExAndThrowWithError(
          new Error("Cannot retrieve legal data backup"),
          "cgn.delete.exception.failure.retrieveLegalDataBackup"
        );
      } else {
        const { cgnCards, eycaCards } = decodedRetrieveLegalDataBackupResult;
        // Backup all data for legal issue
        const legalDataToBackup: DeleteLegalDataBackupActivityInput = {
          backupFolder: "cgn" as NonEmptyString,
          cgnCards,
          eycaCards,
          fiscalCode
        };

        const legalDataBackupResult = yield context.df.callActivityWithRetry(
          "DeleteLegalDataBackupActivity",
          internalRetryOptions,
          legalDataToBackup
        );
        const decodedLegalDataBackupResult = pipe(
          legalDataBackupResult,
          ActivityResult.decode,
          E.getOrElseW(e =>
            trackExAndThrowWithError(
              e,
              "cgn.delete.exception.decode.legalDataBackupUpdate"
            )
          )
        );
        if (decodedLegalDataBackupResult.kind !== "SUCCESS") {
          trackExAndThrowWithError(
            new Error("Cannot backup deleted data for legal issue"),
            "cgn.delete.exception.failure.deleteLegalDataBackupActivityOutput"
          );
        }
      }

      if (eycaCardNumber !== undefined) {
        // Delete EYCA Card by remote API system on eyca.org
        const deleteEycaRemoteResult = yield context.df.callActivityWithRetry(
          "DeleteEycaRemoteActivity",
          internalRetryOptions,
          DeleteEycaRemoteActivityInput.encode({
            cardNumber: eycaCardNumber
          })
        );
        const decodedDeleteEycaRemoteResult = pipe(
          deleteEycaRemoteResult,
          ActivityResult.decode,
          E.getOrElseW(e =>
            trackExAndThrowWithError(
              e,
              "cgn.delete.exception.decode.eycaRemoteOutput"
            )
          )
        );
        if (decodedDeleteEycaRemoteResult.kind !== "SUCCESS") {
          trackExAndThrowWithError(
            new Error("Cannot delete EYCard on EYCA Remote System"),
            "cgn.delete.exception.failure.eycaRemoteActivityOutput"
          );
        }

        // Delete Eyca Expiration Data
        const deleteEycaExpirationResult = yield context.df.callActivityWithRetry(
          "DeleteEycaExpirationActivity",
          internalRetryOptions,
          DeleteEycaExpirationActivityInput.encode({ fiscalCode })
        );
        const decodedDeleteEycaExpirationResult = pipe(
          deleteEycaExpirationResult,
          ActivityResult.decode,
          E.getOrElseW(e =>
            trackExAndThrowWithError(
              e,
              "cgn.delete.exception.decode.eycaExpirationOutput"
            )
          )
        );
        if (decodedDeleteEycaExpirationResult.kind !== "SUCCESS") {
          trackExAndThrowWithError(
            new Error("Cannot delete EYCard Expiration data"),
            "cgn.delete.exception.failure.eycaExpirationActivityOutput"
          );
        }

        // Delete Eyca Card
        const deleteEycaResult = yield context.df.callActivityWithRetry(
          "DeleteEycaActivity",
          internalRetryOptions,
          DeleteEycaActivityInput.encode({ fiscalCode })
        );
        const decodedDeleteEycaResult = pipe(
          deleteEycaResult,
          ActivityResult.decode,
          E.getOrElseW(e =>
            trackExAndThrowWithError(
              e,
              "cgn.delete.exception.decode.eycaOutput"
            )
          )
        );
        if (decodedDeleteEycaResult.kind !== "SUCCESS") {
          trackExAndThrowWithError(
            new Error("Cannot delete EYCard"),
            "cgn.delete.exception.failure.eycaActivityOutput"
          );
        }
      }

      // Delete Cgn Expiration Data
      const deleteCgnExpirationResult = yield context.df.callActivityWithRetry(
        "DeleteCgnExpirationActivity",
        internalRetryOptions,
        DeleteCgnExpirationActivityInput.encode({ fiscalCode })
      );
      const decodedDeleteCgnExpirationResult = pipe(
        deleteCgnExpirationResult,
        ActivityResult.decode,
        E.getOrElseW(e =>
          trackExAndThrowWithError(
            e,
            "cgn.delete.exception.decode.cgnExpirationOutput"
          )
        )
      );
      if (decodedDeleteCgnExpirationResult.kind !== "SUCCESS") {
        trackExAndThrowWithError(
          new Error("Cannot delete CGN expiration data"),
          "cgn.delete.exception.failure.cgnExpirationActivityOutput"
        );
      }

      // Delete Cgn Card
      const deleteCgnResult = yield context.df.callActivityWithRetry(
        "DeleteCgnActivity",
        internalRetryOptions,
        DeleteCgnActivityInput.encode({ fiscalCode })
      );
      const decodedDeleteCgnResult = pipe(
        deleteCgnResult,
        ActivityResult.decode,
        E.getOrElseW(e =>
          trackExAndThrowWithError(e, "cgn.delete.exception.decode.cgnOutput")
        )
      );
      if (decodedDeleteCgnResult.kind !== "SUCCESS") {
        trackExAndThrowWithError(
          new Error("Cannot delete CGN"),
          "cgn.delete.exception.failure.cgnActivityOutput"
        );
      }
    } catch (err) {
      // CGN Delete is failed so we try to send error message if sync flow is stopped
      yield context.df.createTimer(
        addSeconds(context.df.currentUtcDateTime, NOTIFICATION_DELAY_SECONDS)
      );
      trackEvtIfNotReplaying({
        name: "cgn.delete.timer",
        properties: {
          id: fiscalCode,
          status: "ERROR"
        },
        tagOverrides
      });
      if (!context.df.isReplaying) {
        yield context.df.callActivityWithRetry(
          "SendMessageActivity",
          internalRetryOptions,
          SendMessageActivityInput.encode({
            checkProfile: false,
            content: getErrorMessage(),
            fiscalCode
          })
        );
      }

      throw err;
    }

    // keep tracking of UserCgn update successfully
    context.df.setCustomStatus("UPDATED");

    // sleep before sending push notification
    yield context.df.createTimer(
      addSeconds(context.df.currentUtcDateTime, NOTIFICATION_DELAY_SECONDS)
    );

    trackEvtIfNotReplaying({
      name: "cgn.delete.timer",
      properties: {
        id: fiscalCode,
        status: "SUCCESS"
      },
      tagOverrides
    });

    const content = MESSAGES.CardDeleted();
    yield context.df.callActivityWithRetry(
      "SendMessageActivity",
      internalRetryOptions,
      SendMessageActivityInput.encode({
        checkProfile: false,
        content,
        fiscalCode
      })
    );
  } catch (err) {
    context.log.error(`${logPrefix}|ERROR|${String(err)}`);
    trackExIfNotReplaying({
      exception: E.toError(err),
      properties: {
        id: fiscalCode,
        name: "cgn.delete.error"
      },
      tagOverrides
    });
    return false;
  }
  context.df.setCustomStatus("COMPLETED");
};
