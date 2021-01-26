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

import { createTableService } from "azure-storage";
import { getConfigOrThrow } from "../utils/config";
import { getUpdateExpiredCgnHandler } from "./handler";

const config = getConfigOrThrow();

const tableService = createTableService(config.QueueStorageConnection);

const updateExpiredCgnHandler = getUpdateExpiredCgnHandler(
  tableService,
  config.CGN_EXPIRATION_TABLE_NAME
);

export default updateExpiredCgnHandler;
