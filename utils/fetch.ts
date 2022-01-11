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

export const getProtocol = (endpoint: string): string | undefined =>
  pipe(
    endpoint,
    UrlFromString.decode,
    E.map(url => url.protocol?.slice(0, -1)),
    E.getOrElseW(() => undefined)
  );

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const withTimeout = (timeout: Millisecond) => (fetchApi: typeof fetch) =>
  toFetch(setFetchTimeout(timeout, AbortableFetch(fetchApi)));

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const withCertificate = (
  protocol: string,
  getCerts: () => { readonly cert: string; readonly key: string }
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
) => () =>
  protocol === "http"
    ? agent.getHttpFetch(process.env)
    : agent.getHttpsFetch(process.env, getCerts());
