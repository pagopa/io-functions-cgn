import * as df from "durable-functions";
import { getConfigOrThrow } from "../utils/config";
import { updateCgnOrchestratorHandler } from "./handler";

const config = getConfigOrThrow();

export const index = df.orchestrator(ctx =>
  updateCgnOrchestratorHandler(ctx, config.EYCA_UPPER_BOUND_AGE)
);
