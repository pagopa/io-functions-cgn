import * as df from "durable-functions";
import { IOrchestrationFunctionContext } from "durable-functions/lib/src/classes";
import { DurableOrchestrationClient } from "durable-functions/lib/src/durableorchestrationclient";

import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import {
  IResponseErrorConflict,
  IResponseErrorInternal,
  IResponseSuccessAccepted,
  ResponseErrorConflict,
  ResponseErrorInternal,
  ResponseSuccessAccepted
} from "@pagopa/ts-commons/lib/responses";
import { toError } from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";

import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { PromiseType } from "@pagopa/ts-commons/lib/types";
import {
  EventTelemetry,
  ExceptionTelemetry
} from "applicationinsights/out/Declarations/Contracts";
import { array } from "fp-ts";
import { constVoid, flow, pipe } from "fp-ts/lib/function";
import * as t from "io-ts";
import { Card } from "../generated/definitions/Card";
import { StatusEnum as CardActivatedStatusEnum } from "../generated/definitions/CardActivated";
import { StatusEnum as CardExpiredStatusEnum } from "../generated/definitions/CardExpired";
import { StatusEnum as CardPendingStatusEnum } from "../generated/definitions/CardPending";
import { StatusEnum as CardRevokedStatusEnum } from "../generated/definitions/CardRevoked";
import { trackEvent, trackException } from "./appinsights";

/**
 * The identifier for UpdateCgnOrchestrator
 * @param fiscalCode the id of the requesting user
 * @param cardStatus the status of the update's operation
 */
export const makeUpdateCgnOrchestratorId = (
  fiscalCode: FiscalCode,
  cardStatus: string
) => `${fiscalCode}-UPDCGN-${cardStatus}`;

/**
 * The identifier for an EYCA related orchestrator
 * @param fiscalCode the id of the requesting user
 */
export const makeEycaOrchestratorId = (
  fiscalCode: FiscalCode,
  cardStatus: string
) => `${fiscalCode}-EYCA-${cardStatus}`;

export const getOrchestratorStatus = (
  client: DurableOrchestrationClient,
  orchestratorId: string
) => TE.tryCatch(() => client.getStatus(orchestratorId), toError);

/**
 * Returns the status of the orchestrator augmented with an isRunning attribute
 */
export const isOrchestratorRunning = (
  client: DurableOrchestrationClient,
  orchestratorId: string
): TE.TaskEither<
  Error,
  PromiseType<ReturnType<typeof client["getStatus"]>> & {
    isRunning: boolean;
  }
> =>
  pipe(
    getOrchestratorStatus(client, orchestratorId),
    TE.map(status => ({
      ...status,
      isRunning:
        status.runtimeStatus === df.OrchestrationRuntimeStatus.Running ||
        status.runtimeStatus === df.OrchestrationRuntimeStatus.Pending
    }))
  );

const cgnStatuses: ReadonlyArray<string> = [
  CardRevokedStatusEnum.REVOKED.toString(),
  CardActivatedStatusEnum.ACTIVATED.toString(),
  CardExpiredStatusEnum.EXPIRED.toString(),
  CardPendingStatusEnum.PENDING.toString()
];

export type CheckUpdateCardIsRunningErrorTypes =
  | IResponseErrorInternal
  | IResponseSuccessAccepted
  | IResponseErrorConflict;
/**
 * Check if the current user has a pending card status update process.
 */
export const checkUpdateCardIsRunning = (
  client: DurableOrchestrationClient,
  fiscalCode: FiscalCode,
  card: Card,
  getOrchestratorId: (
    fiscalCode: FiscalCode,
    cardStatus: string
  ) => string = makeUpdateCgnOrchestratorId
): TE.TaskEither<CheckUpdateCardIsRunningErrorTypes, false> =>
  pipe(
    getOrchestratorId(fiscalCode, card.status),
    orchestratorId => isOrchestratorRunning(client, orchestratorId),
    TE.mapLeft(err =>
      ResponseErrorInternal(
        `Error checking UpdateCardOrchestrator: ${err.message}`
      )
    ),
    TE.chainW(({ isRunning }) =>
      isRunning ? TE.left(ResponseSuccessAccepted("", undefined)) : TE.of(false)
    ),
    TE.chainW(() =>
      TE.of(cgnStatuses.filter(el => el !== card.status.toString()))
    ),
    TE.chainW(otherStatuses =>
      // check over other possible CGN' s statuses if there is other concurrent
      // orchestrators running. This check allows only one update's orchestrator
      // is running at once for each fiscalCode
      array.sequence(TE.ApplicativePar)(
        otherStatuses.map(status =>
          pipe(
            getOrchestratorId(fiscalCode, status),
            orchId => isOrchestratorRunning(client, orchId),
            TE.mapLeft(err =>
              ResponseErrorInternal(
                `Error checking UpdateCgnOrchestrator: ${err.message}`
              )
            ),
            TE.chainW(({ isRunning }) =>
              isRunning
                ? TE.left(
                    ResponseErrorConflict(
                      `Another Update Cgn orchestrator is running for status ${status}`
                    )
                  )
                : TE.of(false)
            )
          )
        )
      )
    ),
    TE.map(() => false)
  );

export const terminateOrchestratorById = (
  orchestratorId: string,
  client: DurableOrchestrationClient,
  reason: NonEmptyString
) => {
  const voidTask = TE.of<Error, void>(void 0);
  return pipe(
    TE.tryCatch(() => client.getStatus(orchestratorId), toError),
    TE.chain(
      flow(
        O.fromNullable,
        O.chain(
          O.fromPredicate(
            orchestrationStatus =>
              orchestrationStatus.runtimeStatus ===
                df.OrchestrationRuntimeStatus.Running ||
              orchestrationStatus.runtimeStatus ===
                df.OrchestrationRuntimeStatus.Pending
          )
        ),
        O.fold(
          () => voidTask,
          () =>
            pipe(
              TE.tryCatch(
                () => client.terminate(orchestratorId, reason),
                toError
              ),
              TE.chain(() => voidTask),
              TE.orElse(() => voidTask)
            )
        )
      )
    )
  );
};

export const terminateUpdateCgnOrchestratorTask = (
  client: DurableOrchestrationClient,
  fiscalCode: FiscalCode,
  status: string,
  reason: NonEmptyString
) => {
  const orchestratorId = makeUpdateCgnOrchestratorId(fiscalCode, status);
  return terminateOrchestratorById(orchestratorId, client, reason);
};

export const trackExceptionAndThrow = (
  context: IOrchestrationFunctionContext,
  logPrefix: string
) => (err: Error | t.Errors, name: string) => {
  const errMessage = err instanceof Error ? err.message : readableReport(err);
  context.log.verbose(`${logPrefix}|ERROR=${errMessage}`);
  trackException({
    exception: new Error(`${logPrefix}|ERROR=${errMessage}`),
    properties: {
      name
    }
  });
  throw new Error(errMessage);
};

export const getTrackExceptionAndThrowWithErrorStatus = (
  context: IOrchestrationFunctionContext,
  logPrefix: string
) => (err: Error | t.Errors, name: string) => {
  const errMessage = err instanceof Error ? err.message : readableReport(err);
  context.log.verbose(`${logPrefix}|ERROR=${errMessage}`);
  trackException({
    exception: new Error(`${logPrefix}|ERROR=${errMessage}`),
    properties: {
      name
    }
  });
  if (!context.df.isReplaying) {
    context.df.setCustomStatus("ERROR");
  }
  throw new Error(errMessage);
};

/**
 * This function is used to track an AI's event
 * only when the orchestrator attempts max number of retries
 */
export const trackEventIfNotReplaying = (
  context: IOrchestrationFunctionContext
) => (evt: EventTelemetry) =>
  context.df.isReplaying ? constVoid : trackEvent(evt);

/**
 * This function is used to track an AI's exception
 * only when the orchestrator attempts max number of retries
 */
export const trackExceptionIfNotReplaying = (
  context: IOrchestrationFunctionContext
) => (evt: ExceptionTelemetry) =>
  context.df.isReplaying ? constVoid : trackException(evt);
