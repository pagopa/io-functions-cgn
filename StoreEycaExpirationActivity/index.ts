import { createTableService } from "azure-storage";
import { getConfigOrThrow } from "../utils/config";
import { getStoreEycaExpirationActivityHandler } from "./handler";

const config = getConfigOrThrow();

const tableService = createTableService(config.CGN_STORAGE_CONNECTION_STRING);

const storeEycaExpirationActivityHandler = getStoreEycaExpirationActivityHandler(
  tableService,
  config.EYCA_EXPIRATION_TABLE_NAME
);

export default storeEycaExpirationActivityHandler;
