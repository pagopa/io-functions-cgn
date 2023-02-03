import { agent } from "@pagopa/ts-commons";
import { AbortableFetch, setFetchTimeout } from "@pagopa/ts-commons/lib/fetch";
import { Millisecond } from "@pagopa/ts-commons/lib/units";
import nodeFetch from "node-fetch";
import { createClient } from "../generated/services-api/client";
import { getConfigOrThrow } from "../utils/config";

const config = getConfigOrThrow();

const servicesBaseUrl = config.SERVICES_API_URL;
const cgnSubscriptionKey = config.SERVICES_API_KEY;

// 10 seconds timeout by default
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;

// Must be an https endpoint so we use an https agent
const abortableFetch = AbortableFetch(agent.getHttpFetch(process.env));

// const fetchWithTimeout = toFetch(
//   setFetchTimeout(DEFAULT_REQUEST_TIMEOUT_MS as Millisecond, abortableFetch)
// );

// this method can be removed after we migrate @pagopa/ts-commons to node 18 so we can use the new
// implementation of toFetch
// eslint-disable-next-line
export const toRemoveToFetch = (f: any) => (
  input: RequestInfo | URL,
  init?: RequestInit
) => f(input, init).e1;

const fetchWithTimeout = toRemoveToFetch(
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
