// eslint-disable @typescript-eslint/no-explicit-any

import { pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import {
  existsKeyTask,
  getTask,
  setWithExpirationTask
} from "../redis_storage";
import { RedisClient, RedisClientFactory } from "../redis";

const aRedisKey = "KEY";
const aRedisValue = "VALUE";
const aRedisDefaultExpiration = 10;

const setExMock = jest.fn().mockResolvedValue("OK");
const getMock = jest.fn().mockResolvedValue(aRedisValue);
const existsMock = jest.fn().mockResolvedValue(1);

const redisClientMock = ({
  EXISTS: existsMock,
  GET: getMock,
  SETEX: setExMock
} as unknown) as RedisClient;

const redisClientFactoryMock = {
  getInstance: async () => redisClientMock
} as RedisClientFactory;

describe("setWithExpirationTask", () => {
  it("should return true if redis store key-value pair correctly", async () => {
    await pipe(
      setWithExpirationTask(
        redisClientFactoryMock,
        aRedisKey,
        aRedisValue,
        aRedisDefaultExpiration
      ),
      TE.bimap(
        _ => fail(),
        value => expect(value).toEqual(true)
      )
    )();
  });

  it("should return an error if redis store key-value pair returns undefined", async () => {
    setExMock.mockImplementationOnce((_, __, ___) =>
      Promise.resolve(undefined)
    );
    await pipe(
      setWithExpirationTask(
        redisClientFactoryMock,
        aRedisKey,
        aRedisValue,
        aRedisDefaultExpiration
      ),
      TE.bimap(
        _ => expect(_).toBeDefined(),
        () => fail()
      )
    )();
  });

  it("should return an error if redis store key-value pair fails", async () => {
    setExMock.mockImplementationOnce((_, __, ___) =>
      Promise.reject(new Error("Cannot store key-value pair"))
    );
    await pipe(
      setWithExpirationTask(
        redisClientFactoryMock,
        aRedisKey,
        aRedisValue,
        aRedisDefaultExpiration
      ),
      TE.bimap(
        _ => expect(_).toBeDefined(),
        () => fail()
      )
    )();
  });
});

describe("getTask", () => {
  it("should return a value if redis get key-value pair correctly", async () => {
    await pipe(
      getTask(redisClientFactoryMock, aRedisKey),
      TE.bimap(
        () => fail(),
        O.fold(
          () => fail(),
          value => expect(value).toEqual(aRedisValue)
        )
      )
    )();
  });

  it("should return none if no value was found for the provided key", async () => {
    getMock.mockImplementationOnce(_ => Promise.resolve(undefined));
    await pipe(
      getTask(redisClientFactoryMock, aRedisKey),
      TE.bimap(
        () => fail(),
        maybeResult => expect(O.isNone(maybeResult)).toBeTruthy()
      )
    )();
  });

  it("should return an error if redis get value fails", async () => {
    getMock.mockImplementationOnce(_ =>
      Promise.reject(new Error("Cannot get value"))
    );
    await pipe(
      getTask(redisClientFactoryMock, aRedisKey),
      TE.bimap(
        _ => expect(_).toBeDefined(),
        () => fail()
      )
    )();
  });
});

describe("existsTask", () => {
  it("should return true if key exists in redis", async () => {
    await pipe(
      existsKeyTask(redisClientFactoryMock, aRedisKey),
      TE.bimap(
        () => fail(),
        exists => expect(exists).toBeTruthy()
      )
    )();
  });

  it("should return false if key does not exists in redis", async () => {
    existsMock.mockImplementationOnce(_ => Promise.resolve(0));
    await pipe(
      existsKeyTask(redisClientFactoryMock, aRedisKey),
      TE.bimap(
        () => fail(),
        exists => expect(exists).toBeFalsy()
      )
    )();
  });

  it("should return an error if redis exists fails", async () => {
    existsMock.mockImplementationOnce(_ =>
      Promise.reject(new Error("Cannot recognize exists on redis"))
    );
    await pipe(
      existsKeyTask(redisClientFactoryMock, aRedisKey),
      TE.bimap(
        _ => expect(_).toBeDefined(),
        () => fail()
      )
    )();
  });
});
