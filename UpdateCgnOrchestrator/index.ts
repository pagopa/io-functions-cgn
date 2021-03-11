import { IOrchestrationFunctionContext } from "durable-functions/lib/src/classes";

import { addSeconds } from "date-fns";
import * as df from "durable-functions";
import * as t from "io-ts";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import { StatusEnum as RevokedStatusEnum } from "../generated/definitions/CardRevoked";

import { ActivityInput as EnqueueEycaActivationActivityInput } from "../EnqueueEycaActivationActivity/handler";
import { Card } from "../generated/definitions/Card";
import { StatusEnum as ActivatedStatusEnum } from "../generated/definitions/CardActivated";
import { StatusEnum as ExpiredStatusEnum } from "../generated/definitions/CardExpired";
import { ActivityInput as SendMessageActivityInput } from "../SendMessageActivity/handler";
import { ActivityInput as StoreCgnExpirationActivityInput } from "../StoreCgnExpirationActivity/handler";
import { ActivityInput } from "../UpdateCgnStatusActivity/handler";
import { ActivityResult } from "../utils/activity";
import { isEycaEligible } from "../utils/cgn_checks";
import { getErrorMessage, getMessage } from "../utils/messages";
import {
  getTrackExceptionAndThrowWithErrorStatus,
  trackEventIfNotReplaying,
  trackExceptionAndThrow,
  trackExceptionIfNotReplaying
} from "../utils/orchestrators";
import { internalRetryOptions } from "../utils/retry_policies";

export const OrchestratorInput = t.interface({
  fiscalCode: FiscalCode,
  newStatusCard: Card
});
export type OrchestratorInput = t.TypeOf<typeof OrchestratorInput>;

const NOTIFICATION_DELAY_SECONDS = 10;

export const handler = function*(
  context: IOrchestrationFunctionContext,
  logPrefix: string = "UpdateCgnOrchestrator"
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
    trackExAndThrow(e, "cgn.update.exception.decode.input")
  );

  const { fiscalCode, newStatusCard } = decodedInput;
  const tagOverrides = {
    "ai.operation.id": fiscalCode,
    "ai.operation.parentId": fiscalCode
  };

  try {
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
          trackExAndThrowWithError(
            e,
            "cgn.update.exception.decode.storeCgnExpirationActivityOutput"
          )
        );

        if (decodedStoreCgnExpirationResult.kind !== "SUCCESS") {
          trackExAndThrowWithError(
            new Error("Cannot store CGN Expiration"),
            "cgn.update.exception.failure.storeCgnExpirationActivityOutput"
          );
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
        trackExAndThrowWithError(
          e,
          "cgn.update.exception.decode.activityOutput"
        )
      );

      if (updateCgnResult.kind !== "SUCCESS") {
        trackExAndThrowWithError(
          new Error("Cannot update CGN Status"),
          "cgn.update.exception.failure.activityOutput"
        );
      }
      // tslint:disable-next-line: no-useless-catch
    } catch (err) {
      if (newStatusCard.status === ActivatedStatusEnum.ACTIVATED) {
        // CGN Activation is failed so we try to send error message if sync flow is stopped
        yield context.df.createTimer(
          addSeconds(context.df.currentUtcDateTime, NOTIFICATION_DELAY_SECONDS)
        );
        trackEvtIfNotReplaying({
          name: "cgn.update.timer",
          properties: {
            id: fiscalCode,
            status: "ERROR"
          },
          tagOverrides
        });
        if (!context.df.isReplaying) {
          const content = getErrorMessage();
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
      }
      throw err;
    }

    if (newStatusCard.status === ActivatedStatusEnum.ACTIVATED) {
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
          trackExIfNotReplaying({
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

      trackEvtIfNotReplaying({
        name: "cgn.update.timer",
        properties: {
          id: fiscalCode,
          status: "SUCCESS"
        },
        tagOverrides
      });

      const content = getMessage(newStatusCard);
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
    trackExIfNotReplaying({
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
