import { IOrchestrationFunctionContext } from "durable-functions/lib/src/classes";

import * as E from "fp-ts/lib/Either";
import * as t from "io-ts";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { pipe } from "fp-ts/lib/function";
import { ActivityInput as DeleteCgnActivityInput } from "../DeleteCgnActivity/handler";
import { ActivityInput as DeleteCgnExpirationActivityInput } from "../DeleteCgnExpirationActivity/handler";
import { ActivityInput as DeleteEycaActivityInput } from "../DeleteEycaActivity/handler";
import { ActivityInput as DeleteEycaExpirationActivityInput } from "../DeleteEycaExpirationActivity/handler";
import { ActivityInput as DeleteEycaRemoteActivityInput } from "../DeleteEycaRemoteActivity/handler";
import { ActivityInput as DeleteLegalDataBackupActivityInput } from "../DeleteLegalDataBackupActivity/handler";
import { ActivityInput as UpsertSpecialServiceActivationActivityInput } from "../UpsertSpecialServiceActivationActivity/handler";
import { CcdbNumber } from "../generated/definitions/CcdbNumber";
import { ActivityResult } from "../utils/activity";
import {
  getTrackExceptionAndThrowWithErrorStatus,
  trackExceptionAndThrow,
  trackExceptionIfNotReplaying
} from "../utils/orchestrators";
import { internalRetryOptions } from "../utils/retry_policies";
import { upsertSpecialServiceGenerator } from "../utils/special_service";
import { ActivationStatusEnum } from "../generated/services-api/ActivationStatus";

export const OrchestratorInput = t.intersection([
  t.interface({
    fiscalCode: FiscalCode
  }),
  t.partial({
    eycaCardNumber: CcdbNumber
  })
]);
export type OrchestratorInput = t.TypeOf<typeof OrchestratorInput>;

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
  if (!context.df.isReplaying) {
    context.df.setCustomStatus("RUNNING");
  }

  const callUpsertSpecialServiceActivity = upsertSpecialServiceGenerator(
    context
  );

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
    const upsertSpecialServicePendingActivityInput = UpsertSpecialServiceActivationActivityInput.encode(
      {
        activationStatus: ActivationStatusEnum.PENDING,
        fiscalCode
      }
    );

    yield* callUpsertSpecialServiceActivity(
      upsertSpecialServicePendingActivityInput,
      trackExAndThrowWithError
    );
    // First Backup all data for legal issue
    const legalDataToBackup: DeleteLegalDataBackupActivityInput = {
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
          new Error("Cannot delete EYCA Card on EYCA Remote System"),
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
          trackExAndThrowWithError(e, "cgn.delete.exception.decode.eycaOutput")
        )
      );
      if (decodedDeleteEycaResult.kind !== "SUCCESS") {
        trackExAndThrowWithError(
          new Error("Cannot delete EYCA Card"),
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

    const upsertSpecialServiceInactiveActivityInput = UpsertSpecialServiceActivationActivityInput.encode(
      {
        activationStatus: ActivationStatusEnum.INACTIVE,
        fiscalCode
      }
    );

    yield* callUpsertSpecialServiceActivity(
      upsertSpecialServiceInactiveActivityInput,
      trackExAndThrowWithError
    );

    // keep tracking of UserCgn update successfully
    context.df.setCustomStatus("UPDATED");
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
