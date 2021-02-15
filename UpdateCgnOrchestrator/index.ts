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
import { CardExpired } from "../generated/definitions/CardExpired";
import {
  CardRevoked,
  StatusEnum as RevokedStatusEnum
} from "../generated/definitions/CardRevoked";

import { ActivityInput as EnqueueEycaActivationActivityInput } from "../EnqueueEycaActivationActivity/handler";
import { Card } from "../generated/definitions/Card";
import { StatusEnum as ActivatedStatusEnum } from "../generated/definitions/CardActivated";
import { StatusEnum as ExpiredStatusEnum } from "../generated/definitions/CardExpired";
import { ActivityInput as SendMessageActivityInput } from "../SendMessageActivity/handler";
import { ActivityInput as StoreCgnExpirationActivityInput } from "../StoreCgnExpirationActivity/handler";
import { ActivityInput } from "../UpdateCgnStatusActivity/handler";
import { ActivityResult } from "../utils/activity";
import { trackEvent, trackException } from "../utils/appinsights";
import { isEycaEligible } from "../utils/cgn_checks";
import { getMessage } from "../utils/messages";
import { internalRetryOptions } from "../utils/retry_policies";

export const OrchestratorInput = t.interface({
  fiscalCode: FiscalCode,
  newStatusCard: Card
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

const getMessageType = (card: Card) => {
  if (CardRevoked.is(card)) {
    return "CardRevoked";
  }
  if (CardExpired.is(card)) {
    return "CardExpired";
  } else {
    return "CardActivated";
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

  const { fiscalCode, newStatusCard } = decodedInput;
  const tagOverrides = {
    "ai.operation.id": fiscalCode,
    "ai.operation.parentId": fiscalCode
  };

  try {
    if (newStatusCard.status === ActivatedStatusEnum.ACTIVATED) {
      const storeCgnExpirationResult = yield context.df.callActivityWithRetry(
        "StoreCgnExpirationActivity",
        internalRetryOptions,
        StoreCgnExpirationActivityInput.encode({
          activationDate: newStatusCard.activation_date,
          expirationDate: newStatusCard.expiration_date,
          fiscalCode
        })
      );
      const decodedStoreCgnExpirationResult = ActivityResult.decode(
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

      // now we try to enqueue an EYCA activation if user is eligible for eyca
      const isEycaEligibleResult = isEycaEligible(fiscalCode).getOrElseL(e =>
        trackExAndThrow(e, "cgn.update.exception.eyca.eligibilityCheck")
      );

      if (isEycaEligibleResult) {
        // if citizen is eligible to get an EYCA card we try to enqueue an EYCA card activation
        const enqueueEycaActivationActivityInput = EnqueueEycaActivationActivityInput.encode(
          {
            fiscalCode
          }
        );
        const enqueueEycaActivationResult = yield context.df.callActivityWithRetry(
          "EnqueueEycaActivationActivity",
          internalRetryOptions,
          enqueueEycaActivationActivityInput
        );

        const enqueueEycaActivationOutput = ActivityResult.decode(
          enqueueEycaActivationResult
        ).getOrElseL(e =>
          trackExAndThrow(
            e,
            "cgn.update.exception.eyca.activation.activityOutput"
          )
        );

        if (enqueueEycaActivationOutput.kind !== "SUCCESS") {
          trackExceptionIfNotReplaying({
            exception: new Error("Cannot enqueue an EYCA Card activation"),
            properties: {
              id: fiscalCode,
              name: "cgn.update.eyca.activation.error"
            },
            tagOverrides
          });
        }
      }
    }
    const updateCgnStatusActivityInput = ActivityInput.encode({
      card: newStatusCard,
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
    ].includes(newStatusCard.status);

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

      const content = getMessage(getMessageType(newStatusCard), newStatusCard);
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
