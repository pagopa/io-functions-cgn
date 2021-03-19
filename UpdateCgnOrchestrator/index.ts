import * as df from "durable-functions";
import { getConfigOrThrow } from "../utils/config";
import { handler } from "./handler";

const config = getConfigOrThrow();

export const index = df.orchestrator(ctx =>
  handler(ctx, config.EYCA_BETA_TEST_UPPER_BOUND_AGE)
);
