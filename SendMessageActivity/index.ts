import { agent } from "@pagopa/ts-commons";
import { AbortableFetch, setFetchTimeout } from "@pagopa/ts-commons/lib/fetch";
import { IntegerFromString } from "@pagopa/ts-commons/lib/numbers";
import { Millisecond } from "@pagopa/ts-commons/lib/units";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import { toRemoveToFetch } from "../clients/services";
import { getConfigOrThrow } from "../utils/config";
import { getGetProfile, getSendMessage } from "../utils/notifications";
import { getSendMessageActivityHandler } from "./handler";

// HTTP external requests timeout in milliseconds
const SERVICES_REQUEST_TIMEOUT_MS = pipe(
  process.env.SERVICES_REQUEST_TIMEOUT_MS,
  IntegerFromString.decode,
  E.getOrElse(() => 10000)
);

const config = getConfigOrThrow();
// Needed to call notifications API
const servicesApiUrl = config.SERVICES_API_URL;
const servicesApiKey = config.SERVICES_API_KEY;

// HTTP-only fetch with optional keepalive agent
// @see https://github.com/pagopa/io-ts-commons/blob/master/src/agent.ts#L10
const httpApiFetch = agent.getHttpFetch(process.env);

// a fetch that can be aborted and that gets cancelled after fetchTimeoutMs
const abortableFetch = AbortableFetch(httpApiFetch);

const timeoutFetch = toRemoveToFetch(
  setFetchTimeout(SERVICES_REQUEST_TIMEOUT_MS as Millisecond, abortableFetch)
);

const sendMessageActivityHandler = getSendMessageActivityHandler(
  getGetProfile(servicesApiUrl, servicesApiKey, timeoutFetch),
  getSendMessage(servicesApiUrl, servicesApiKey, timeoutFetch)
);

export default sendMessageActivityHandler;
