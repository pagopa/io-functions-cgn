import * as df from "durable-functions";
import { DeleteCgnOrchestratorHandler } from "./handler";

export const index = df.orchestrator(ctx => DeleteCgnOrchestratorHandler(ctx));
