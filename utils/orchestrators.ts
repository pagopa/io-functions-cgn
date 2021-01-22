import * as df from "durable-functions";
import { DurableOrchestrationClient } from "durable-functions/lib/src/durableorchestrationclient";
import { array } from "fp-ts/lib/Array";

import { toError } from "fp-ts/lib/Either";
import {
  fromLeft,
  taskEither,
  TaskEither,
  tryCatch
} from "fp-ts/lib/TaskEither";
import {
  IResponseErrorConflict,
  IResponseErrorInternal,
  IResponseSuccessAccepted,
  ResponseErrorConflict,
  ResponseErrorInternal,
  ResponseSuccessAccepted
} from "italia-ts-commons/lib/responses";

import { FiscalCode } from "italia-ts-commons/lib/strings";
import { PromiseType } from "italia-ts-commons/lib/types";
import { StatusEnum as CgnActivatedStatusEnum } from "../generated/definitions/CgnActivatedStatus";
import { StatusEnum as CgnCanceledStatusEnum } from "../generated/definitions/CgnCanceledStatus";
import { StatusEnum as CgnPendingStatusEnum } from "../generated/definitions/CgnPendingStatus";
import { StatusEnum as CgnRevokedStatusEnum } from "../generated/definitions/CgnRevokedStatus";
import { CgnStatus } from "../generated/definitions/CgnStatus";

/**
 * The identifier for StartEligibilityCheckOrchestrator
 * @param fiscalCode the id of the requesting user
 */
export const makeUpdateCgnOrchestratorId = (
  fiscalCode: FiscalCode,
  cgnStatus: string
) => `${fiscalCode}-UPDCGN-${cgnStatus}`;

/**
 * Returns the status of the orchestrator augmented with an isRunning attribute
 */
export const isOrchestratorRunning = (
  client: DurableOrchestrationClient,
  orchestratorId: string
): TaskEither<
  Error,
  PromiseType<ReturnType<typeof client["getStatus"]>> & {
    isRunning: boolean;
  }
> =>
  tryCatch(() => client.getStatus(orchestratorId), toError).map(status => ({
    ...status,
    isRunning:
      status.runtimeStatus === df.OrchestrationRuntimeStatus.Running ||
      status.runtimeStatus === df.OrchestrationRuntimeStatus.Pending
  }));

const cgnStatuses: ReadonlyArray<string> = [
  CgnRevokedStatusEnum.REVOKED.toString(),
  CgnActivatedStatusEnum.ACTIVATED.toString(),
  CgnCanceledStatusEnum.CANCELED.toString(),
  CgnPendingStatusEnum.PENDING.toString()
];

export type CheckUpdateCgnIsRunningErrorTypes =
  | IResponseErrorInternal
  | IResponseSuccessAccepted
  | IResponseErrorConflict;
/**
 * Check if the current user has a pending cgn status update process.
 */
export const checkUpdateCgnIsRunning = (
  client: DurableOrchestrationClient,
  fiscalCode: FiscalCode,
  cgnStatus: CgnStatus
): TaskEither<CheckUpdateCgnIsRunningErrorTypes, false> =>
  isOrchestratorRunning(
    client,
    makeUpdateCgnOrchestratorId(fiscalCode, cgnStatus.status)
  )
    .foldTaskEither<CheckUpdateCgnIsRunningErrorTypes, false>(
      err =>
        fromLeft(
          ResponseErrorInternal(
            `Error checking UpdateCgnOrchestrator: ${err.message}`
          )
        ),
      ({ isRunning }) =>
        isRunning ? fromLeft(ResponseSuccessAccepted()) : taskEither.of(false)
    )
    .chain(_ =>
      taskEither.of(
        cgnStatuses.filter(el => el !== cgnStatus.status.toString())
      )
    )
    .chain(otherStatuses =>
      // check over other possible CGN' s statuses if there is other concurrent
      // orchestrators running. This check allows only one update's orchestrator
      // is running at once
      array.sequence(taskEither)(
        otherStatuses.map(status =>
          isOrchestratorRunning(
            client,
            makeUpdateCgnOrchestratorId(fiscalCode, status)
          ).foldTaskEither<CheckUpdateCgnIsRunningErrorTypes, false>(
            err =>
              fromLeft(
                ResponseErrorInternal(
                  `Error checking UpdateCgnOrchestrator: ${err.message}`
                )
              ),
            ({ isRunning }) =>
              isRunning
                ? fromLeft(
                    ResponseErrorConflict(
                      `Another Update Cgn orchestrator is running for status ${status}`
                    )
                  )
                : taskEither.of(false)
          )
        )
      )
    )
    .map(_ => false);
