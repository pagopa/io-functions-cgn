import { identity, pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as redis from "redis";
import { getConfigOrThrow } from "./config";

const config = getConfigOrThrow();
const DEFAULT_REDIS_PORT = "6379";

export type RedisClient = redis.RedisClientType | redis.RedisClusterType;

export const createSimpleRedisClient = async (
  redisUrl: string,
  password?: string,
  port?: string,
  useTls: boolean = true
): Promise<RedisClient> => {
  const redisPort: number = parseInt(port || DEFAULT_REDIS_PORT, 10);
  const redisClient = redis.createClient<
    redis.RedisDefaultModules,
    Record<string, never>,
    Record<string, never>
  >({
    password,
    socket: {
      port: redisPort,
      tls: useTls
    },
    url: redisUrl
  });
  await redisClient.connect();
  return redisClient;
};

export const createClusterRedisClient = async (
  redisUrl: string,
  password?: string,
  port?: string
): Promise<RedisClient> => {
  const redisPort: number = parseInt(port || DEFAULT_REDIS_PORT, 10);
  const redisClient = redis.createCluster<
    redis.RedisDefaultModules,
    Record<string, never>,
    Record<string, never>
  >({
    defaults: {
      legacyMode: true,
      password
    },
    rootNodes: [
      {
        url: `${redisUrl}:${redisPort}`
      }
    ],
    useReplicas: true
  });
  await redisClient.connect();
  return redisClient;
};

export const REDIS_CLIENT = pipe(
  config.isProduction,
  O.fromPredicate<boolean>(identity),
  O.chainNullableK(_ => config.REDIS_CLUSTER_ENABLED),
  O.chain(O.fromPredicate(identity)),
  O.map(() =>
    createClusterRedisClient(
      config.REDIS_URL,
      config.REDIS_PASSWORD,
      config.REDIS_PORT
    )
  ),
  O.getOrElse(() =>
    createSimpleRedisClient(
      config.REDIS_URL,
      config.REDIS_PASSWORD,
      config.REDIS_PORT,
      config.REDIS_TLS_ENABLED
    )
  )
);
