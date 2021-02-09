import { createTableService } from "azure-storage";
import { getConfigOrThrow } from "../utils/config";
import { getStoreCgnExpirationActivityHandler } from "./handler";

const config = getConfigOrThrow();

const tableService = createTableService(config.CGN_STORAGE_CONNECTION_STRING);

const storeCgnExpirationActivityHandler = getStoreCgnExpirationActivityHandler(
  tableService,
  config.CGN_EXPIRATION_TABLE_NAME
);

export default storeCgnExpirationActivityHandler;
