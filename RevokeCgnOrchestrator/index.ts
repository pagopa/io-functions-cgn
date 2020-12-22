import { IOrchestrationFunctionContext } from "durable-functions/lib/src/classes";

import { EventTelemetry } from "applicationinsights/out/Declarations/Contracts";
import { addSeconds } from "date-fns";
import * as df from "durable-functions";
import { constVoid } from "fp-ts/lib/function";
import * as t from "io-ts";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import { StatusEnum } from "../generated/definitions/CgnRevokedStatus";
import { ActivityInput as SendMessageActivityInput } from "../SendMessageActivity/handler";
import {
  ActivityInput,
  ActivityResult
} from "../UpdateCgnStatusActivity/handler";
import { trackEvent, trackException } from "../utils/appinsights";
import { getMessage } from "../utils/messages";
import { internalRetryOptions } from "../utils/retry_policies";

export const OrchestratorInput = t.interface({
  fiscalCode: FiscalCode,
  revokeMotivation: NonEmptyString
});
export type OrchestratorInput = t.TypeOf<typeof OrchestratorInput>;

const NOTIFICATION_DELAY_SECONDS = 10;

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
  logPrefix: string = "RevokeCgnOrchestrator"
): Generator {
  const trackExAndThrow = trackExceptionAndThrow(context, logPrefix);
  context.df.setCustomStatus("RUNNING");
  const trackEventIfNotReplaying = (evt: EventTelemetry) =>
    context.df.isReplaying ? constVoid : trackEvent(evt);

  const input = context.df.getInput();
  const decodedInput = OrchestratorInput.decode(input).getOrElseL(e =>
    trackExAndThrow(e, "cgn.revoke.exception.decode.input")
  );

  const fiscalCode = decodedInput.fiscalCode;
  const tagOverrides = {
    "ai.operation.id": fiscalCode,
    "ai.operation.parentId": fiscalCode
  };

  const cgnStatus = {
    motivation: decodedInput.revokeMotivation,
    revokation_date: new Date(),
    status: StatusEnum.REVOKED
  };

  const updateCgnStatusActivityInput = ActivityInput.encode({
    cgnStatus,
    fiscalCode
  });
  const updateStatusResult = yield context.df.callActivityWithRetry(
    "UpdateCgnStatusActivity",
    internalRetryOptions,
    updateCgnStatusActivityInput
  );

  const updateCgnResult = ActivityResult.decode(
    updateStatusResult
  ).getOrElseL(e =>
    trackExAndThrow(e, "cgn.revoke.exception.decode.activityOutput")
  );

  if (updateCgnResult.kind === "SUCCESS") {
    // sleep before sending push notification
    // so we can let the get operation stop the flow here
    yield context.df.createTimer(
      addSeconds(context.df.currentUtcDateTime, NOTIFICATION_DELAY_SECONDS)
    );

    trackEventIfNotReplaying({
      name: "cgn.revoke.timer",
      properties: {
        id: fiscalCode,
        status: `${updateCgnResult.kind}`
      },
      tagOverrides
    });

    const content = getMessage("CgnRevokedStatus", cgnStatus);
    yield context.df.callActivityWithRetry(
      "SendMessageActivity",
      internalRetryOptions,
      SendMessageActivityInput.encode({
        checkProfile: false,
        content,
        fiscalCode
      })
    );
  } else {
    trackExAndThrow(
      new Error("Cannot update CGN Status"),
      "revokeCgn.exception.decode.activityOutput"
    );
  }
  context.df.setCustomStatus("COMPLETED");
};

export const index = df.orchestrator(handler);
