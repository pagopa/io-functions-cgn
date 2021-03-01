import { IOrchestrationFunctionContext } from "durable-functions/lib/src/classes";

import { ExceptionTelemetry } from "applicationinsights/out/Declarations/Contracts";
import * as df from "durable-functions";
import { constVoid } from "fp-ts/lib/function";
import * as t from "io-ts";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { FiscalCode } from "italia-ts-commons/lib/strings";

import { ActivityInput as StoreEycaExpirationActivityInput } from "../StoreEycaExpirationActivity/handler";
import { ActivityInput as SuccessEycaActivationActivityInput } from "../SuccessEycaActivationActivity/handler";

import { Timestamp } from "../generated/definitions/Timestamp";
import { ActivityResult } from "../utils/activity";
import { trackException } from "../utils/appinsights";
import { internalRetryOptions } from "../utils/retry_policies";

export const OrchestratorInput = t.interface({
  activationDate: Timestamp,
  expirationDate: Timestamp,
  fiscalCode: FiscalCode
});
export type OrchestratorInput = t.TypeOf<typeof OrchestratorInput>;

const trackExceptionAndThrow = (
  context: IOrchestrationFunctionContext,
  logPrefix: string
) => (err: Error | t.Errors, name: string) => {
  context.log.verbose(
    err instanceof Error
      ? `${logPrefix}|ERROR=${err.message}`
      : `${logPrefix}|ERROR=${readableReport(err)}`
  );
  trackException({
    exception: new Error(`${logPrefix}|ERROR=${String(err)}`),
    properties: {
      name
    }
  });
  throw new Error(String(err));
};

export const handler = function*(
  context: IOrchestrationFunctionContext,
  logPrefix: string = "StartEycaActivationOrchestrator"
): Generator {
  const trackExAndThrow = trackExceptionAndThrow(context, logPrefix);
  context.df.setCustomStatus("RUNNING");

  const trackExceptionIfNotReplaying = (evt: ExceptionTelemetry) =>
    context.df.isReplaying ? constVoid : trackException(evt);

  const input = context.df.getInput();

  const {
    activationDate,
    expirationDate,
    fiscalCode
  } = OrchestratorInput.decode(input).getOrElseL(e =>
    trackExAndThrow(e, "cgn.eyca.update.exception.decode.input")
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

    const expirationDateStoreActivityResultDecoded = ActivityResult.decode(
      expirationDateStoreActivityResult
    ).getOrElseL(_ =>
      trackExAndThrow(_, "eyca.activate.exception.decode.activityOutput")
    );

    if (expirationDateStoreActivityResultDecoded.kind !== "SUCCESS") {
      trackExAndThrow(
        new Error("Cannot store EYCA Card expiration date"),
        "eyca.activate.exception.failure.activityStoreExpirationDate"
      );
    }

    const successEycaActivationActivityResult = yield context.df.callActivityWithRetry(
      "SuccessEycaActivationActivity",
      internalRetryOptions,
      updateEycaStatusActivityInput
    );

    const decodedSuccessEycaActivationActivity = ActivityResult.decode(
      successEycaActivationActivityResult
    ).getOrElseL(_ =>
      trackExAndThrow(_, "eyca.activate.exception.decode.activityOutput")
    );

    if (decodedSuccessEycaActivationActivity.kind !== "SUCCESS") {
      trackExAndThrow(
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
