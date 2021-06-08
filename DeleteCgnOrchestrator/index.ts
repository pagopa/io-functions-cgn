import * as df from "durable-functions";
import { getConfigOrThrow } from "../utils/config";
import { cosmosdbClient } from "../utils/cosmosdb";
import { DeleteCgnOrchestratorHandler } from "./handler";
import { USER_CGN_COLLECTION_NAME, UserCgnModel } from "../models/user_cgn";
import { UserEycaCardModel, USER_EYCA_CARD_COLLECTION_NAME } from "../models/user_eyca_card";

export const index = df.orchestrator(ctx =>
  DeleteCgnOrchestratorHandler(ctx)
);
