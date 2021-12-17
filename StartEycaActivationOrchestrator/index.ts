import { IOrchestrationFunctionContext } from "durable-functions/lib/src/classes";

import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { ExceptionTelemetry } from "applicationinsights/out/Declarations/Contracts";
import * as df from "durable-functions";
import { constVoid, pipe } from "fp-ts/lib/function";
import * as t from "io-ts";

import { ActivityInput as StoreEycaExpirationActivityInput } from "../StoreEycaExpirationActivity/handler";
import { ActivityInput as SuccessEycaActivationActivityInput } from "../SuccessEycaActivationActivity/handler";

import * as E from "fp-ts/lib/Either";
import { Timestamp } from "../generated/definitions/Timestamp";
import { ActivityResult } from "../utils/activity";
import { trackException } from "../utils/appinsights";
import { getTrackExceptionAndThrowWithErrorStatus } from "../utils/orchestrators";
import { internalRetryOptions } from "../utils/retry_policies";

export const OrchestratorInput = t.interface({
  activationDate: Timestamp,
  expirationDate: Timestamp,
  fiscalCode: FiscalCode
});
export type OrchestratorInput = t.TypeOf<typeof OrchestratorInput>;

export const handler = function*(
  context: IOrchestrationFunctionContext,
  logPrefix: string = "StartEycaActivationOrchestrator"
): Generator {
  const trackExAndThrowWithErrorStatus = getTrackExceptionAndThrowWithErrorStatus(
    context,
    logPrefix
  );
  if (!context.df.isReplaying) {
    context.df.setCustomStatus("RUNNING");
  }

  const trackExceptionIfNotReplaying = (evt: ExceptionTelemetry) =>
    context.df.isReplaying ? constVoid : trackException(evt);

  const input = context.df.getInput();

  const { activationDate, expirationDate, fiscalCode } = pipe(
    input,
    OrchestratorInput.decode,
    E.getOrElseW(e =>
      trackExAndThrowWithErrorStatus(
        e,
        "cgn.eyca.update.exception.decode.input"
      )
    )
  );
  const tagOverrides = {
    "ai.operation.id": fiscalCode,
    "ai.operation.parentId": fiscalCode
  };

  try {
    const updateEycaStatusActivityInput = SuccessEycaActivationActivityInput.encode(
      {
        activationDate,
        expirationDate,
        fiscalCode
      }
    );

    /** Store eyca card expiration date before activating the card.
     * If the card activation process ends with error, it will be triggered again from the
     * "ContinueEycaActivation" function
     */
    const expirationDateStoreActivityResult = yield context.df.callActivityWithRetry(
      "StoreEycaExpirationActivity",
      internalRetryOptions,
      StoreEycaExpirationActivityInput.encode({
        activationDate,
        expirationDate,
        fiscalCode
      })
    );

    const expirationDateStoreActivityResultDecoded = pipe(
      expirationDateStoreActivityResult,
      ActivityResult.decode,
      E.getOrElseW(_ =>
        trackExAndThrowWithErrorStatus(
          _,
          "eyca.activate.exception.decode.activityOutput"
        )
      )
    );

    if (expirationDateStoreActivityResultDecoded.kind !== "SUCCESS") {
      trackExAndThrowWithErrorStatus(
        new Error("Cannot store EYCA Card expiration date"),
        "eyca.activate.exception.failure.activityStoreExpirationDate"
      );
    }

    const successEycaActivationActivityResult = yield context.df.callActivityWithRetry(
      "SuccessEycaActivationActivity",
      internalRetryOptions,
      updateEycaStatusActivityInput
    );

    const decodedSuccessEycaActivationActivity = pipe(
      successEycaActivationActivityResult,
      ActivityResult.decode,
      E.getOrElseW(_ =>
        trackExAndThrowWithErrorStatus(
          _,
          "eyca.activate.exception.decode.activityOutput"
        )
      )
    );

    if (decodedSuccessEycaActivationActivity.kind !== "SUCCESS") {
      trackExAndThrowWithErrorStatus(
        new Error("Cannot activate EYCA Card"),
        "eyca.activate.exception.failure.activityOutput"
      );
    }
  } catch (err) {
    context.log.error(`${logPrefix}|ERROR|${String(err)}`);
    trackExceptionIfNotReplaying({
      exception: err,
      properties: {
        id: fiscalCode,
        name: "eyca.activation.error"
      },
      tagOverrides
    });
    return false;
  }
  context.df.setCustomStatus("COMPLETED");
};

export const index = df.orchestrator(handler);
