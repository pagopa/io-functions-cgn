import { IOrchestrationFunctionContext } from "durable-functions/lib/src/classes";

import * as df from "durable-functions";
import * as t from "io-ts";
import { FiscalCode } from "italia-ts-commons/lib/strings";

import { ActivityInput as ExpireEycaActivityInput } from "../ExpireEycaActivity/handler";

import { ActivityInput as SendMessageActivityInput } from "../SendMessageActivity/handler";
import { ActivityResult } from "../utils/activity";
import { getEycaExpirationMessage } from "../utils/messages";
import {
  getTrackExceptionAndThrowWithErrorStatus,
  trackExceptionIfNotReplaying
} from "../utils/orchestrators";
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
  const trackExIfNotReplaying = trackExceptionIfNotReplaying(context);

  if (!context.df.isReplaying) {
    context.df.setCustomStatus("RUNNING");
  }

  const input = context.df.getInput();

  const { fiscalCode } = OrchestratorInput.decode(input).getOrElseL(e =>
    trackExAndThrowWithErrorStatus(e, "eyca.expiration.exception.decode.input")
  );
  const tagOverrides = {
    "ai.operation.id": fiscalCode,
    "ai.operation.parentId": fiscalCode
  };

  try {
    const eycaExpirationActivityInput = ExpireEycaActivityInput.encode({
      fiscalCode
    });

    const eycaExpirationActivityResult = yield context.df.callActivityWithRetry(
      "ExpireEycaActivity",
      internalRetryOptions,
      eycaExpirationActivityInput
    );

    const decodedEycaExpirationActivity = ActivityResult.decode(
      eycaExpirationActivityResult
    ).getOrElseL(_ =>
      trackExAndThrowWithErrorStatus(
        _,
        "eyca.expiration.exception.decode.activityOutput"
      )
    );

    if (decodedEycaExpirationActivity.kind !== "SUCCESS") {
      trackExAndThrowWithErrorStatus(
        new Error("Cannot expire EYCA Card"),
        "eyca.expiration.exception.failure.activityOutput"
      );
    }
    // keep tracking of UserEycaCard expiration successfully
    context.df.setCustomStatus("UPDATED");

    yield context.df.callActivityWithRetry(
      "SendMessageActivity",
      internalRetryOptions,
      SendMessageActivityInput.encode({
        checkProfile: false,
        content: getEycaExpirationMessage(),
        fiscalCode
      })
    );
  } catch (err) {
    context.log.error(`${logPrefix}|ERROR|${String(err)}`);
    trackExIfNotReplaying({
      exception: err,
      properties: {
        id: fiscalCode,
        name: "eyca.expiration.error"
      },
      tagOverrides
    });
    return false;
  }
  context.df.setCustomStatus("COMPLETED");
};

export const index = df.orchestrator(handler);
