import { agent } from "@pagopa/ts-commons";
import {
  AbortableFetch,
  setFetchTimeout,
  toFetch
} from "@pagopa/ts-commons/lib/fetch";
import { Millisecond } from "@pagopa/ts-commons/lib/units";
import { UrlFromString } from "@pagopa/ts-commons/lib/url";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";

export const getProtocol = (endpoint: string) =>
  pipe(
    endpoint,
    UrlFromString.decode,
    E.map(url => url.protocol?.slice(0, -1)),
    E.getOrElseW(() => undefined)
  );

export const withTimeout = (timeout: Millisecond) => (fetchApi: typeof fetch) =>
  toFetch(setFetchTimeout(timeout, AbortableFetch(fetchApi)));

export const withCertificate = (
  protocol: string,
  getCerts: () => { cert: string; key: string }
) => () =>
  protocol === "http"
    ? agent.getHttpFetch(process.env)
    : agent.getHttpsFetch(process.env, getCerts());
