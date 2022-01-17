/**
 * Config module
 *
 * Single point of access for the application confguration. Handles validation on required environment variables.
 * The configuration is evaluate eagerly at the first access to the module. The module exposes convenient methods to access such value.
 */
/* eslint-disable sort-keys */

import {
  IntegerFromString,
  NonNegativeInteger
} from "@pagopa/ts-commons/lib/numbers";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as t from "io-ts";
import { ServiceId } from "../generated/services-api/ServiceId";

export const RedisParams = t.intersection([
  t.interface({
    REDIS_URL: NonEmptyString
  }),
  t.partial({
    REDIS_CLUSTER_ENABLED: t.boolean,
    REDIS_PASSWORD: NonEmptyString,
    REDIS_PORT: NonEmptyString,
    REDIS_TLS_ENABLED: t.boolean
  })
]);
export type RedisParams = t.TypeOf<typeof RedisParams>;

export const DEFAULT_CGN_UPPER_BOUND_AGE = 36 as NonNegativeInteger;
export const DEFAULT_EYCA_UPPER_BOUND_AGE = 31 as NonNegativeInteger;

export const CgnServiceParams = t.interface({
  CGN_SERVICE_ID: ServiceId,
  SERVICES_API_KEY: NonEmptyString,
  SERVICES_API_URL: NonEmptyString
});
export type CgnServiceParams = t.TypeOf<typeof CgnServiceParams>;

// global app configuration
export type IConfig = t.TypeOf<typeof IConfig>;
export const IConfig = t.intersection([
  t.interface({
    APPINSIGHTS_INSTRUMENTATIONKEY: NonEmptyString,

    CGN_EXPIRATION_TABLE_NAME: NonEmptyString,
    EYCA_EXPIRATION_TABLE_NAME: NonEmptyString,

    CGN_UPPER_BOUND_AGE: NonNegativeInteger,
    EYCA_UPPER_BOUND_AGE: NonNegativeInteger,

    COSMOSDB_CGN_DATABASE_NAME: NonEmptyString,
    COSMOSDB_CGN_KEY: NonEmptyString,
    COSMOSDB_CGN_URI: NonEmptyString,

    AzureWebJobsStorage: NonEmptyString,
    CGN_STORAGE_CONNECTION_STRING: NonEmptyString,

    EYCA_API_BASE_URL: NonEmptyString,
    EYCA_API_PASSWORD: NonEmptyString,
    EYCA_API_USERNAME: NonEmptyString,

    CgnCardsDataBackupStorageConnection: NonEmptyString,

    CGN_CARDS_DATA_BACKUP_CONTAINER_NAME: NonEmptyString,

    OTP_TTL_IN_SECONDS: NonNegativeInteger,
    isProduction: t.boolean
  }),
  RedisParams,
  CgnServiceParams
]);

// No need to re-evaluate this object for each call
const errorOrConfig: t.Validation<IConfig> = IConfig.decode({
  ...process.env,
  CGN_UPPER_BOUND_AGE: pipe(
    process.env.CGN_UPPER_BOUND_AGE,
    IntegerFromString.decode,
    E.map(_ => _ as NonNegativeInteger),
    E.getOrElse(() => DEFAULT_CGN_UPPER_BOUND_AGE)
  ),
  EYCA_UPPER_BOUND_AGE: pipe(
    process.env.EYCA_UPPER_BOUND_AGE,
    IntegerFromString.decode,
    E.map(_ => _ as NonNegativeInteger),
    E.getOrElse(() => DEFAULT_EYCA_UPPER_BOUND_AGE)
  ),
  OTP_TTL_IN_SECONDS: pipe(
    process.env.OTP_TTL_IN_SECONDS,
    IntegerFromString.decode,
    E.map(_ => _ as NonNegativeInteger),
    E.getOrElse(() => 600 as NonNegativeInteger)
  ),
  REDIS_CLUSTER_ENABLED: pipe(
    O.fromNullable(process.env.REDIS_CLUSTER_ENABLED),
    O.map(_ => _.toLowerCase() === "true"),
    O.toUndefined
  ),
  REDIS_TLS_ENABLED: pipe(
    O.fromNullable(process.env.REDIS_TLS_ENABLED),
    O.map(_ => _.toLowerCase() === "true"),
    O.toUndefined
  ),
  isProduction: process.env.NODE_ENV === "production"
});

/**
 * Read the application configuration and check for invalid values.
 * Configuration is eagerly evalued when the application starts.
 *
 * @returns either the configuration values or a list of validation errors
 */
export const getConfig = (): t.Validation<IConfig> => errorOrConfig;

/**
 * Read the application configuration and check for invalid values.
 * If the application is not valid, raises an exception.
 *
 * @returns the configuration values
 * @throws validation errors found while parsing the application configuration
 */
export const getConfigOrThrow = (): IConfig =>
  pipe(
    errorOrConfig,
    E.getOrElseW(errors => {
      throw new Error(`Invalid configuration: ${readableReport(errors)}`);
    })
  );
