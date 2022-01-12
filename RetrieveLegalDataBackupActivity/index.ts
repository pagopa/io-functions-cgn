import { UserCgnModel, USER_CGN_COLLECTION_NAME } from "../models/user_cgn";
import {
  UserEycaCardModel,
  USER_EYCA_CARD_COLLECTION_NAME
} from "../models/user_eyca_card";
import { getConfigOrThrow } from "../utils/config";
import { cosmosdbClient } from "../utils/cosmosdb";
import { getRetrieveLegalDataBackupActivityHandler } from "./handler";

const config = getConfigOrThrow();

const userCgnsContainer = cosmosdbClient
  .database(config.COSMOSDB_CGN_DATABASE_NAME)
  .container(USER_CGN_COLLECTION_NAME);

const userCgnModel = new UserCgnModel(userCgnsContainer);

const userEycaContainer = cosmosdbClient
  .database(config.COSMOSDB_CGN_DATABASE_NAME)
  .container(USER_EYCA_CARD_COLLECTION_NAME);

const userEycaCardModel = new UserEycaCardModel(userEycaContainer);

const retrieveLegalDataBackupActivityHandler = getRetrieveLegalDataBackupActivityHandler(
  userCgnModel,
  userEycaCardModel
);

export default retrieveLegalDataBackupActivityHandler;
