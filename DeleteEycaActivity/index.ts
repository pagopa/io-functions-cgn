import { UserEycaCardModel, USER_EYCA_CARD_COLLECTION_NAME } from "../models/user_eyca_card";
import { getConfigOrThrow } from "../utils/config";
import { cosmosdbClient } from "../utils/cosmosdb";
import { getDeleteEycaActivityHandler } from "./handler";

const config = getConfigOrThrow();

const userCgnsContainer = cosmosdbClient
  .database(config.COSMOSDB_CGN_DATABASE_NAME)
  .container(USER_EYCA_CARD_COLLECTION_NAME);

const userEycaCardModel = new UserEycaCardModel(userCgnsContainer);

const deleteEycaActivityHandler = getDeleteEycaActivityHandler(
  userEycaCardModel
);

export default deleteEycaActivityHandler;
