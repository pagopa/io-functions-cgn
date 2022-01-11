import { agent } from "@pagopa/ts-commons";
import {
  AbortableFetch,
  setFetchTimeout,
  toFetch
} from "@pagopa/ts-commons/lib/fetch";
import { Millisecond } from "@pagopa/ts-commons/lib/units";
import nodeFetch from "node-fetch";
import { createClient } from "../generated/services-api/client";
import { getConfigOrThrow } from "../utils/config";

const config = getConfigOrThrow();

export const servicesBaseUrl = config.SERVICES_API_URL;
export const cgnSubscriptionKey = config.SERVICES_API_KEY;

// 5 seconds timeout by default
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;

// Must be an https endpoint so we use an https agent
const abortableFetch = AbortableFetch(agent.getHttpFetch(process.env));
const fetchWithTimeout = toFetch(
  setFetchTimeout(DEFAULT_REQUEST_TIMEOUT_MS as Millisecond, abortableFetch)
);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fetchApi: typeof fetchWithTimeout = (nodeFetch as any) as typeof fetchWithTimeout;

export const ServicesAPIClient = createClient<"SubscriptionKey">({
  baseUrl: servicesBaseUrl,
  fetchApi,
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  withDefaults: op => params =>
    op({ SubscriptionKey: cgnSubscriptionKey, ...params })
});
export type ServicesAPIClient = typeof ServicesAPIClient;
