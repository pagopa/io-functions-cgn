import { createTableService } from "azure-storage";
import { getConfigOrThrow } from "../utils/config";
import { getStoreCgnExpirationActivityHandler } from "./handler";

const config = getConfigOrThrow();

const tableService = createTableService(config.QueueStorageConnection);

const storeCgnExpirationActivityHandler = getStoreCgnExpirationActivityHandler(
  tableService,
  config.CGN_EXPIRATION_TABLE_NAME
);

export default storeCgnExpirationActivityHandler;
