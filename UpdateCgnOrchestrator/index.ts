import * as df from "durable-functions";
import { getConfigOrThrow } from "../utils/config";
import { UpdateCgnOrchestratorHandler } from "./handler";

const config = getConfigOrThrow();

export const index = df.orchestrator(ctx =>
  UpdateCgnOrchestratorHandler(ctx, config.EYCA_UPPER_BOUND_AGE)
);
