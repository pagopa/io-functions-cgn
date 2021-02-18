import { EycaAPIClient } from "../clients/eyca";
import { createClient } from "../generated/eyca-api/client";
import {
  USER_EYCA_CARD_COLLECTION_NAME,
  UserEycaCardModel
} from "../models/user_eyca_card";
import { getConfigOrThrow } from "../utils/config";
import { cosmosdbClient } from "../utils/cosmosdb";
import { getSuccessEycaActivationActivityHandler } from "./handler";

const config = getConfigOrThrow();

const userEycaCardsContainer = cosmosdbClient
  .database(config.COSMOSDB_CGN_DATABASE_NAME)
  .container(USER_EYCA_CARD_COLLECTION_NAME);

const userEycaCardModel = new UserEycaCardModel(userEycaCardsContainer);

const eycaClient = EycaAPIClient();

const successEycaActivationActivityHandler = getSuccessEycaActivationActivityHandler(
  eycaClient,
  userEycaCardModel
);

export default successEycaActivationActivityHandler;
