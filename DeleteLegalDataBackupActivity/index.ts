import { createBlobService } from "azure-storage";
import { USER_CGN_COLLECTION_NAME, UserCgnModel } from "../models/user_cgn";
import {
  USER_EYCA_CARD_COLLECTION_NAME,
  UserEycaCardModel
} from "../models/user_eyca_card";
import { getConfigOrThrow } from "../utils/config";
import { cosmosdbClient } from "../utils/cosmosdb";
import { getDeleteLegalDataBackupActivityHandler } from "./handler";

const config = getConfigOrThrow();

const cardsDataBackupBlobService = createBlobService(
  config.CGN_DATA_BACKUP_CONNECTION
);

const cardsDataBackupContainerName =
  config.CGN_CARDS_DATA_BACKUP_CONTAINER_NAME;

const userCgnsContainer = cosmosdbClient
  .database(config.COSMOSDB_CGN_DATABASE_NAME)
  .container(USER_CGN_COLLECTION_NAME);

const userCgnModel = new UserCgnModel(userCgnsContainer);

const userEycaContainer = cosmosdbClient
  .database(config.COSMOSDB_CGN_DATABASE_NAME)
  .container(USER_EYCA_CARD_COLLECTION_NAME);

const userEycaCardModel = new UserEycaCardModel(userEycaContainer);

const deleteLegalDataBackupActivityHandler = getDeleteLegalDataBackupActivityHandler(
  cardsDataBackupBlobService,
  cardsDataBackupContainerName,
  userCgnModel,
  userEycaCardModel
);

export default deleteLegalDataBackupActivityHandler;
