import { EycaAPIClient } from "../clients/eyca";
import { getConfigOrThrow } from "../utils/config";
import { redisClientFactory } from "../utils/redis";
import { getDeleteEycaRemoteActivityHandler } from "./handler";

const config = getConfigOrThrow();

const eycaClient = EycaAPIClient(config.EYCA_API_BASE_URL);

const deleteEycaRemoteActivityHandler = getDeleteEycaRemoteActivityHandler(
  redisClientFactory,
  eycaClient,
  config.EYCA_API_USERNAME,
  config.EYCA_API_PASSWORD
);

export default deleteEycaRemoteActivityHandler;
