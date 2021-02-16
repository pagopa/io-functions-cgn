import { QueueService } from "azure-storage";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { getConfigOrThrow } from "./config";

const config = getConfigOrThrow();

export const queueService = new QueueService(
  config.CGN_STORAGE_CONNECTION_STRING
);

export const EYCA_ACTIVATIONS_QUEUE_NAME = "eycaactivations" as NonEmptyString;
