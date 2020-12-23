/*
 * This function is not intended to be invoked directly. Instead it will be
 * triggered by an orchestrator function.
 *
 * Before running this sample, please:
 * - create a Durable orchestration function
 * - create a Durable HTTP starter function
 * - run 'yarn add durable-functions' from the wwwroot folder of your
 *   function app in Kudu
 */

import { USER_CGN_COLLECTION_NAME, UserCgnModel } from "../models/user_cgn";
import sendMessageActivityHandler from "../SendMessageActivity";
import { getConfigOrThrow } from "../utils/config";
import { cosmosdbClient } from "../utils/cosmosdb";
import { getUpdateCgnStatusActivityHandler } from "./handler";

const config = getConfigOrThrow();

const userCgnsContainer = cosmosdbClient
  .database(config.COSMOSDB_NAME)
  .container(USER_CGN_COLLECTION_NAME);

const userCgnModel = new UserCgnModel(userCgnsContainer);

const updateCgnStatusActivityHandler = getUpdateCgnStatusActivityHandler(
  userCgnModel
);

export default updateCgnStatusActivityHandler;
