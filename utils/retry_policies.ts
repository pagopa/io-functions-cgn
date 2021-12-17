import { IntegerFromString } from "@pagopa/ts-commons/lib/numbers";
import { RetryOptions } from "durable-functions";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";

const RETRY_OPTIONS_FIRST_RETRY_INTERVAL_MS = pipe(
  process.env.RETRY_OPTIONS_FIRST_RETRY_INTERVAL_MS,
  IntegerFromString.decode,
  E.getOrElse(() => 500)
);

const RETRY_OPTIONS_BACKOFF_COEFFICIENT = pipe(
  process.env.RETRY_OPTIONS_BACKOFF_COEFFICIENT,
  IntegerFromString.decode,
  E.getOrElse(() => 1.5)
);

//
// Used for internal calls between IO services
//
const INTERNAL_RETRY_OPTIONS_MAX_ATTEMPTS = pipe(
  process.env.INTERNAL_RETRY_OPTIONS_MAX_ATTEMPTS,
  IntegerFromString.decode,
  E.getOrElse(() => 10)
);
export const internalRetryOptions: RetryOptions = new RetryOptions(
  RETRY_OPTIONS_FIRST_RETRY_INTERVAL_MS,
  INTERNAL_RETRY_OPTIONS_MAX_ATTEMPTS
);
// tslint:disable-next-line: no-object-mutation
internalRetryOptions.backoffCoefficient = RETRY_OPTIONS_BACKOFF_COEFFICIENT;
