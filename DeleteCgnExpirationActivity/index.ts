import { createTableService } from "azure-storage";
import { getConfigOrThrow } from "../utils/config";
import { getDeleteCgnExpirationActivityHandler } from "./handler";

const config = getConfigOrThrow();

const tableService = createTableService(config.CGN_STORAGE_CONNECTION_STRING);

const deleteCgnExpirationActivityHandler = getDeleteCgnExpirationActivityHandler(
  tableService,
  config.CGN_EXPIRATION_TABLE_NAME,
  config.CGN_UPPER_BOUND_AGE
);

export default deleteCgnExpirationActivityHandler;
