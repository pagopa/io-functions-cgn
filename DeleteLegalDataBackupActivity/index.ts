import { createBlobService } from "azure-storage";
import { getConfigOrThrow } from "../utils/config";
import { getDeleteLegalDataBackupActivityHandler } from "./handler";

const config = getConfigOrThrow();

const cardsDataBackupBlobService = createBlobService(
  config.CgnCardsDataBackupStorageConnection
);

const cardsDataBackupContainerName = config.CGN_CARDS_DATA_BACKUP_CONTAINER_NAME;

const deleteLegalDataBackupActivityHandler = getDeleteLegalDataBackupActivityHandler(
  cardsDataBackupBlobService,
  cardsDataBackupContainerName
);

export default deleteLegalDataBackupActivityHandler;
