import { IOrchestrationFunctionContext } from "durable-functions/lib/src/classes";

import { ExceptionTelemetry } from "applicationinsights/out/Declarations/Contracts";
import * as df from "durable-functions";
import { constVoid } from "fp-ts/lib/function";
import * as t from "io-ts";
import { FiscalCode } from "italia-ts-commons/lib/strings";

import { ActivityInput } from "../SuccessEycaActivationActivity/handler";
import { ActivityResult } from "../utils/activity";
import { trackException } from "../utils/appinsights";
import { getTrackExceptionAndThrowWithErrorStatus } from "../utils/orchestrators";
import { internalRetryOptions } from "../utils/retry_policies";

export const OrchestratorInput = t.interface({
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
  context.df.setCustomStatus("RUNNING");

  const trackExceptionIfNotReplaying = (evt: ExceptionTelemetry) =>
    context.df.isReplaying ? constVoid : trackException(evt);

  const input = context.df.getInput();

  const { fiscalCode } = OrchestratorInput.decode(input).getOrElseL(e =>
    trackExAndThrowWithErrorStatus(e, "cgn.eyca.update.exception.decode.input")
  );
  const tagOverrides = {
    "ai.operation.id": fiscalCode,
    "ai.operation.parentId": fiscalCode
  };

  try {
    const updateEycaStatusActivityInput = ActivityInput.encode({
      fiscalCode
    });
    const updateStatusResult = yield context.df.callActivityWithRetry(
      "SuccessEycaActivationActivity",
      internalRetryOptions,
      updateEycaStatusActivityInput
    );

    const updateEycaResult = ActivityResult.decode(
      updateStatusResult
    ).getOrElseL(e =>
      trackExAndThrowWithErrorStatus(
        e,
        "eyca.activate.exception.decode.activityOutput"
      )
    );

    if (updateEycaResult.kind !== "SUCCESS") {
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
