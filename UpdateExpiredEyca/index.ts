import { createTableService } from "azure-storage";
import { getConfigOrThrow } from "../utils/config";
import { getUpdateExpiredEycaHandler } from "./handler";

const config = getConfigOrThrow();

const tableService = createTableService(config.CGN_STORAGE_CONNECTION_STRING);

const updateExpiredEycaHandler = getUpdateExpiredEycaHandler(
  tableService,
  config.EYCA_EXPIRATION_TABLE_NAME
);

export default updateExpiredEycaHandler;
