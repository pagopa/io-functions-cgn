import { IOrchestrationFunctionContext } from "durable-functions/lib/src/classes";

import { ExceptionTelemetry } from "applicationinsights/out/Declarations/Contracts";
import * as df from "durable-functions";
import { constVoid } from "fp-ts/lib/function";
import * as t from "io-ts";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { FiscalCode } from "italia-ts-commons/lib/strings";

import {
  ActivityInput,
  ActivityResult
} from "../SuccessEycaActivationActivity/handler";
import { trackException } from "../utils/appinsights";
import { internalRetryOptions } from "../utils/retry_policies";

export const OrchestratorInput = t.interface({
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

  const { fiscalCode } = OrchestratorInput.decode(input).getOrElseL(e =>
    trackExAndThrow(e, "cgn.eyca.update.exception.decode.input")
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
      trackExAndThrow(e, "eyca.activate.exception.decode.activityOutput")
    );

    if (updateEycaResult.kind !== "SUCCESS") {
      trackExAndThrow(
        new Error("Cannot activate EYCA Card"),
        "eyca.activate.exception.failure.activityOutput"
      );
    }

    context.df.setCustomStatus("UPDATED");
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
