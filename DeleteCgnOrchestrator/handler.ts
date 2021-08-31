import { IOrchestrationFunctionContext } from "durable-functions/lib/src/classes";

import { addSeconds } from "date-fns";
import * as t from "io-ts";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import {
  ActivityInput as DeleteCgnActivityInput,
  DeleteCgnActivityResult
} from "../DeleteCgnActivity/handler";
import { ActivityInput as DeleteCgnExpirationActivityInput } from "../DeleteCgnExpirationActivity/handler";
import { DeleteEycaActivityResult } from "../DeleteEycaActivity/handler";
import { ActivityInput as DeleteEycaActivityInput } from "../DeleteEycaActivity/handler";
import { ActivityInput as DeleteEycaExpirationActivityInput } from "../DeleteEycaExpirationActivity/handler";
import { ActivityInput as DeleteEycaRemoteActivityInput } from "../DeleteEycaRemoteActivity/handler";
import { ActivityInput as DeleteLegalDataBackupActivityInput } from "../DeleteLegalDataBackupActivity/handler";
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
  const decodedInput = OrchestratorInput.decode(input).getOrElseL(e =>
    trackExAndThrow(e, "cgn.delete.exception.decode.input")
  );

  const { fiscalCode, eycaCardNumber } = decodedInput;
  // TODO: verificare
  const tagOverrides = {
    "ai.operation.id": fiscalCode,
    "ai.operation.parentId": fiscalCode
  };

  // tslint:disable-next-line: no-let
  let eycaDataToBackup;
  // tslint:disable-next-line: no-let
  let cgnDataToBackup;

  try {
    try {
      if (eycaCardNumber !== undefined) {
        // Delete EYCA Card by remote API system on eyca.org
        const deleteEycaRemoteResult = yield context.df.callActivityWithRetry(
          "DeleteEycaRemoteActivity",
          internalRetryOptions,
          DeleteEycaRemoteActivityInput.encode({
            cardNumber: eycaCardNumber
          })
        );
        const decodedDeleteEycaRemoteResult = ActivityResult.decode(
          deleteEycaRemoteResult
        ).getOrElseL(e =>
          trackExAndThrowWithError(
            e,
            "cgn.delete.exception.decode.eycaRemoteOutput"
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
        const decodedDeleteEycaExpirationResult = ActivityResult.decode(
          deleteEycaExpirationResult
        ).getOrElseL(e =>
          trackExAndThrowWithError(
            e,
            "cgn.delete.exception.decode.eycaExpirationOutput"
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
        const decodedDeleteEycaResult = DeleteEycaActivityResult.decode(
          deleteEycaResult
        ).getOrElseL(e =>
          trackExAndThrowWithError(e, "cgn.delete.exception.decode.eycaOutput")
        );
        if (decodedDeleteEycaResult.kind !== "SUCCESS") {
          trackExAndThrowWithError(
            new Error("Cannot delete EYCard"),
            "cgn.delete.exception.failure.eycaActivityOutput"
          );
        } else {
          eycaDataToBackup = decodedDeleteEycaResult.cards;
        }
      }

      // Delete Cgn Expiration Data
      const deleteCgnExpirationResult = yield context.df.callActivityWithRetry(
        "DeleteCgnExpirationActivity",
        internalRetryOptions,
        DeleteCgnExpirationActivityInput.encode({ fiscalCode })
      );
      const decodedDeleteCgnExpirationResult = ActivityResult.decode(
        deleteCgnExpirationResult
      ).getOrElseL(e =>
        trackExAndThrowWithError(
          e,
          "cgn.delete.exception.decode.cgnExpirationOutput"
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
      const decodedDeleteCgnResult = DeleteCgnActivityResult.decode(
        deleteCgnResult
      ).getOrElseL(e =>
        trackExAndThrowWithError(e, "cgn.delete.exception.decode.cgnOutput")
      );
      if (decodedDeleteCgnResult.kind !== "SUCCESS") {
        trackExAndThrowWithError(
          new Error("Cannot delete CGN"),
          "cgn.delete.exception.failure.cgnActivityOutput"
        );
      } else {
        cgnDataToBackup = decodedDeleteCgnResult.cards;

        // Backup all data for legal issue
        const legatDataToBackup: DeleteLegalDataBackupActivityInput = {
          backupFolder: "cgn" as NonEmptyString,
          cgnCards: cgnDataToBackup,
          eycaCards: eycaDataToBackup,
          fiscalCode
        };

        const legalDataBackupResult = yield context.df.callActivityWithRetry(
          "DeleteLegalDataBackupActivity",
          internalRetryOptions,
          legatDataToBackup
        );
        const decodedLegalDataBackupResult = ActivityResult.decode(
          legalDataBackupResult
        ).getOrElseL(e =>
          trackExAndThrowWithError(
            e,
            "cgn.delete.exception.decode.legalDataBackupUpdate"
          )
        );
        if (decodedLegalDataBackupResult.kind !== "SUCCESS") {
          trackExAndThrowWithError(
            new Error("Cannot backup deleted data for legal issue"),
            "cgn.delete.exception.failure.deleteLegalDataBackupActivityOutput"
          );
        }
      }

      // tslint:disable-next-line: no-useless-catch
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

    // TODO: define "cgn.delete.timer"
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
      exception: err,
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
