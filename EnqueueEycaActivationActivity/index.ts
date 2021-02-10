import {
  USER_EYCA_CARD_COLLECTION_NAME,
  UserEycaCardModel
} from "../models/user_eyca_card";
import { getConfigOrThrow } from "../utils/config";
import { cosmosdbClient } from "../utils/cosmosdb";
import { getEnqueueEycaActivation } from "../utils/models";
import { EYCA_ACTIVATIONS_QUEUE_NAME, queueService } from "../utils/queue";
import { getEnqueueEycaActivationActivityHandler } from "./handler";

const config = getConfigOrThrow();

const userEycaCardsContainer = cosmosdbClient
  .database(config.COSMOSDB_CGN_DATABASE_NAME)
  .container(USER_EYCA_CARD_COLLECTION_NAME);

const userEycaCardModel = new UserEycaCardModel(userEycaCardsContainer);

const enqueueEycaActivationActivityHandler = getEnqueueEycaActivationActivityHandler(
  userEycaCardModel,
  getEnqueueEycaActivation(queueService, EYCA_ACTIVATIONS_QUEUE_NAME)
);

export default enqueueEycaActivationActivityHandler;
