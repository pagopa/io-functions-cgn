﻿import { EycaAPIClient } from "../clients/eyca";
import {
  USER_EYCA_CARD_COLLECTION_NAME,
  UserEycaCardModel
} from "../models/user_eyca_card";
import { getConfigOrThrow } from "../utils/config";
import { cosmosdbClient } from "../utils/cosmosdb";
import { REDIS_CLIENT } from "../utils/redis";
import { getSuccessEycaActivationActivityHandler } from "./handler";

const config = getConfigOrThrow();

const userEycaCardsContainer = cosmosdbClient
  .database(config.COSMOSDB_CGN_DATABASE_NAME)
  .container(USER_EYCA_CARD_COLLECTION_NAME);

const userEycaCardModel = new UserEycaCardModel(userEycaCardsContainer);

const eycaClient = EycaAPIClient(config.EYCA_API_BASE_URL);

const successEycaActivationActivityHandler = getSuccessEycaActivationActivityHandler(
  REDIS_CLIENT,
  eycaClient,
  config.EYCA_API_USERNAME,
  config.EYCA_API_PASSWORD,
  userEycaCardModel
);

export default successEycaActivationActivityHandler;
