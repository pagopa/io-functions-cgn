import { RetryOptions } from "durable-functions";
import { IntegerFromString } from "italia-ts-commons/lib/numbers";

const RETRY_OPTIONS_FIRST_RETRY_INTERVAL_MS = IntegerFromString.decode(
  process.env.RETRY_OPTIONS_FIRST_RETRY_INTERVAL_MS
).getOrElse(500);

const RETRY_OPTIONS_BACKOFF_COEFFICIENT = IntegerFromString.decode(
  process.env.RETRY_OPTIONS_BACKOFF_COEFFICIENT
).getOrElse(1.5);

//
// Used for internal calls between IO services
//
const INTERNAL_RETRY_OPTIONS_MAX_ATTEMPTS = IntegerFromString.decode(
  process.env.INTERNAL_RETRY_OPTIONS_MAX_ATTEMPTS
).getOrElse(10);
export const internalRetryOptions: RetryOptions = new RetryOptions(
  RETRY_OPTIONS_FIRST_RETRY_INTERVAL_MS,
  INTERNAL_RETRY_OPTIONS_MAX_ATTEMPTS
);
// tslint:disable-next-line: no-object-mutation
internalRetryOptions.backoffCoefficient = RETRY_OPTIONS_BACKOFF_COEFFICIENT;
