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
