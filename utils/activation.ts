import * as df from "durable-functions";
import { DurableOrchestrationStatus } from "durable-functions/lib/src/classes";
import { none, Option, some } from "fp-ts/lib/Option";
import { StatusEnum } from "../generated/definitions/CgnActivationDetail";

export const getActivationStatus = (
  orchestratorStatus: DurableOrchestrationStatus
): Option<StatusEnum> => {
  if (
    orchestratorStatus.customStatus === "UPDATED" ||
    orchestratorStatus.customStatus === "COMPLETED"
  ) {
    return some(StatusEnum.COMPLETED);
  }

  if (orchestratorStatus.customStatus === "ERROR") {
    return some(StatusEnum.ERROR);
  }

  switch (orchestratorStatus.runtimeStatus) {
    case df.OrchestrationRuntimeStatus.Pending:
      return some(StatusEnum.PENDING);
    case df.OrchestrationRuntimeStatus.Running:
    case df.OrchestrationRuntimeStatus.ContinuedAsNew:
      return some(StatusEnum.RUNNING);
    case df.OrchestrationRuntimeStatus.Failed:
      return some(StatusEnum.ERROR);
    case df.OrchestrationRuntimeStatus.Completed:
    case df.OrchestrationRuntimeStatus.Terminated:
      return some(StatusEnum.COMPLETED);
    default:
      return none;
  }
};
