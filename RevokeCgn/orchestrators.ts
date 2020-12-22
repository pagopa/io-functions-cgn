import { DurableOrchestrationClient } from "durable-functions/lib/src/durableorchestrationclient";
import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import { TaskEither } from "fp-ts/lib/TaskEither";
import {
  IResponseErrorInternal,
  IResponseSuccessAccepted,
  ResponseErrorInternal,
  ResponseSuccessAccepted
} from "italia-ts-commons/lib/responses";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import {
  isOrchestratorRunning,
  makeRevokeCgnOrchestratorId
} from "../utils/orchestrators";

/**
 * Check if the current user has a pending dsu validation request.
 */
export const checkRevokeCgnIsRunning = (
  client: DurableOrchestrationClient,
  fiscalCode: FiscalCode
): TaskEither<IResponseErrorInternal | IResponseSuccessAccepted, false> =>
  isOrchestratorRunning(
    client,
    makeRevokeCgnOrchestratorId(fiscalCode)
  ).foldTaskEither<IResponseErrorInternal | IResponseSuccessAccepted, false>(
    err =>
      fromLeft(
        ResponseErrorInternal(
          `Error checking EligibilityCheckOrchestrator: ${err.message}`
        )
      ),
    ({ isRunning }) =>
      isRunning ? fromLeft(ResponseSuccessAccepted()) : taskEither.of(false)
  );
