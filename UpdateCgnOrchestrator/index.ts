import { IOrchestrationFunctionContext } from "durable-functions/lib/src/classes";

import {
  EventTelemetry,
  ExceptionTelemetry
} from "applicationinsights/out/Declarations/Contracts";
import { addSeconds } from "date-fns";
import * as df from "durable-functions";
import { constVoid } from "fp-ts/lib/function";
import * as t from "io-ts";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import { CgnExpiredStatus } from "../generated/definitions/CgnExpiredStatus";
import {
  CgnRevokedStatus,
  StatusEnum as RevokedStatusEnum
} from "../generated/definitions/CgnRevokedStatus";

import { StatusEnum as ActivatedStatusEnum } from "../generated/definitions/CgnActivatedStatus";
import { StatusEnum as ExpiredStatusEnum } from "../generated/definitions/CgnExpiredStatus";
import { CgnStatus } from "../generated/definitions/CgnStatus";
import { ActivityInput as SendMessageActivityInput } from "../SendMessageActivity/handler";
import {
  ActivityInput as StoreCgnExpirationActivityInput,
  ActivityResult as StoreCgnExpirationActivityResult
} from "../StoreCgnExpirationActivity/handler";
import {
  ActivityInput,
  ActivityResult
} from "../UpdateCgnStatusActivity/handler";
import { trackEvent, trackException } from "../utils/appinsights";
import { getMessage } from "../utils/messages";
import { internalRetryOptions } from "../utils/retry_policies";

export const OrchestratorInput = t.interface({
  fiscalCode: FiscalCode,
  newStatus: CgnStatus
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

const getMessageType = (cgnStatus: CgnStatus) => {
  if (CgnRevokedStatus.is(cgnStatus)) {
    return "CgnRevokedStatus";
  }
  if (CgnExpiredStatus.is(cgnStatus)) {
    return "CgnExpiredStatus";
  } else {
    return "CgnActivatedStatus";
  }
};

export const handler = function*(
  context: IOrchestrationFunctionContext,
  logPrefix: string = "UpdateCgnOrchestrator"
): Generator {
  const trackExAndThrow = trackExceptionAndThrow(context, logPrefix);
  context.df.setCustomStatus("RUNNING");
  const trackEventIfNotReplaying = (evt: EventTelemetry) =>
    context.df.isReplaying ? constVoid : trackEvent(evt);

  const trackExceptionIfNotReplaying = (evt: ExceptionTelemetry) =>
    context.df.isReplaying ? constVoid : trackException(evt);

  const input = context.df.getInput();
  const decodedInput = OrchestratorInput.decode(input).getOrElseL(e =>
    trackExAndThrow(e, "cgn.update.exception.decode.input")
  );

  const { fiscalCode, newStatus } = decodedInput;
  const tagOverrides = {
    "ai.operation.id": fiscalCode,
    "ai.operation.parentId": fiscalCode
  };

  try {
    if (newStatus.status === ActivatedStatusEnum.ACTIVATED) {
      const storeCgnExpirationResult = yield context.df.callActivityWithRetry(
        "StoreCgnExpirationActivity",
        internalRetryOptions,
        StoreCgnExpirationActivityInput.encode({
          activation_date: newStatus.activation_date,
          expirationDate: newStatus.expiration_date,
          fiscalCode
        })
      );
      const decodedStoreCgnExpirationResult = StoreCgnExpirationActivityResult.decode(
        storeCgnExpirationResult
      ).getOrElseL(e =>
        trackExAndThrow(
          e,
          "cgn.update.exception.decode.storeCgnExpirationActivityOutput"
        )
      );

      if (decodedStoreCgnExpirationResult.kind !== "SUCCESS") {
        trackExAndThrow(
          new Error("Cannot store CGN Expiration"),
          "cgn.update.exception.failure.storeCgnExpirationActivityOutput"
        );
      }
    }
    const updateCgnStatusActivityInput = ActivityInput.encode({
      cgnStatus: newStatus,
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
      trackExAndThrow(e, "cgn.update.exception.decode.activityOutput")
    );

    if (updateCgnResult.kind !== "SUCCESS") {
      trackExAndThrow(
        new Error("Cannot update CGN Status"),
        "cgn.update.exception.failure.activityOutput"
      );
    }

    // keep tracking of UserCgn update successfully
    context.df.setCustomStatus("UPDATED");

    const hasSendMessageActivity = [
      RevokedStatusEnum.REVOKED.toString(),
      ActivatedStatusEnum.ACTIVATED.toString(),
      ExpiredStatusEnum.EXPIRED.toString()
    ].includes(newStatus.status);

    if (hasSendMessageActivity) {
      // sleep before sending push notification
      yield context.df.createTimer(
        addSeconds(context.df.currentUtcDateTime, NOTIFICATION_DELAY_SECONDS)
      );

      trackEventIfNotReplaying({
        name: "cgn.update.timer",
        properties: {
          id: fiscalCode,
          status: `${updateCgnResult.kind}`
        },
        tagOverrides
      });

      const content = getMessage(getMessageType(newStatus), newStatus);
      yield context.df.callActivityWithRetry(
        "SendMessageActivity",
        internalRetryOptions,
        SendMessageActivityInput.encode({
          checkProfile: false,
          content,
          fiscalCode
        })
      );
    }
  } catch (err) {
    context.log.error(`${logPrefix}|ERROR|${String(err)}`);
    trackExceptionIfNotReplaying({
      exception: err,
      properties: {
        id: fiscalCode,
        name: "cgn.update.error"
      },
      tagOverrides
    });
    return false;
  }
  context.df.setCustomStatus("COMPLETED");
};

export const index = df.orchestrator(handler);
