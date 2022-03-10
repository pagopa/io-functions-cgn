import * as df from "durable-functions";
import { DeleteCgnOrchestratorHandlerV2 } from "./handler";

export const index = df.orchestrator(ctx =>
  DeleteCgnOrchestratorHandlerV2(ctx)
);
