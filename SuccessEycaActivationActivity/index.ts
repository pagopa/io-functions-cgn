import { EycaAPIClient } from "../clients/eyca";
import {
  USER_EYCA_CARD_COLLECTION_NAME,
  UserEycaCardModel
} from "../models/user_eyca_card";
import { getConfigOrThrow } from "../utils/config";
import { cosmosdbClient } from "../utils/cosmosdb";
import { RedisClientFactory } from "../utils/redis";
import { getSuccessEycaActivationActivityHandler } from "./handler";

const config = getConfigOrThrow();

const redisClientFactory = new RedisClientFactory(config);

const userEycaCardsContainer = cosmosdbClient
  .database(config.COSMOSDB_CGN_DATABASE_NAME)
  .container(USER_EYCA_CARD_COLLECTION_NAME);

const userEycaCardModel = new UserEycaCardModel(userEycaCardsContainer);

const eycaClient = EycaAPIClient(config.EYCA_API_BASE_URL);

const successEycaActivationActivityHandler = getSuccessEycaActivationActivityHandler(
  redisClientFactory,
  eycaClient,
  config.EYCA_API_USERNAME,
  config.EYCA_API_PASSWORD,
  userEycaCardModel
);

export default successEycaActivationActivityHandler;
