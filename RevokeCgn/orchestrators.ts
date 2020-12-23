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
import { StatusEnum } from "../generated/definitions/CgnRevokedStatus";
import {
  isOrchestratorRunning,
  makeUpdateCgnOrchestratorId
} from "../utils/orchestrators";
/**
 * Check if the current user has a pending cgn status update process.
 */
export const checkRevokeCgnIsRunning = (
  client: DurableOrchestrationClient,
  fiscalCode: FiscalCode
): TaskEither<IResponseErrorInternal | IResponseSuccessAccepted, false> =>
  isOrchestratorRunning(
    client,
    makeUpdateCgnOrchestratorId(fiscalCode, StatusEnum.REVOKED)
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
