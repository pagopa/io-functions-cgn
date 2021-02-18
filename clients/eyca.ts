import nodeFetch from "node-fetch";
import { Client, createClient } from "../generated/eyca-api/client";
import { getConfigOrThrow } from "../utils/config";

const config = getConfigOrThrow();
export const eycaBaseUrl = config.EYCA_API_BASE_URL;
export const eycaApiUsername = config.EYCA_API_USERNAME;
export const eycaApiPassword = config.EYCA_API_PASSWORD;

export function EycaAPIClient(
  // tslint:disable-next-line: no-any
  fetchApi: typeof fetch = (nodeFetch as any) as typeof fetch
): Client {
  return createClient({
    basePath: "",
    baseUrl: eycaBaseUrl,
    fetchApi
  });
}

export type EycaAPIClient = typeof EycaAPIClient;
