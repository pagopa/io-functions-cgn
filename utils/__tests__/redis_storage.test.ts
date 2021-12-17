// eslint-disable @typescript-eslint/no-explicit-any

import { pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import {
  existsKeyTask,
  getTask,
  setWithExpirationTask
} from "../redis_storage";

const aRedisKey = "KEY";
const aRedisValue = "VALUE";
const aRedisDefaultExpiration = 10;

const setMock = jest
  .fn()
  .mockImplementation((_, __, ___, ____, cb) => cb(undefined, "OK"));
const getMock = jest.fn().mockImplementation((_, cb) => cb(null, aRedisValue));
const existsMock = jest.fn().mockImplementation((_, cb) => cb(null, 1));
const redisClientMock = {
  exists: existsMock,
  get: getMock,
  set: setMock
};

describe("setWithExpirationTask", () => {
  it("should return true if redis store key-value pair correctly", async () => {
    await pipe(
      setWithExpirationTask(
        redisClientMock as any,
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
    setMock.mockImplementationOnce((_, __, ___, ____, cb) =>
      cb(undefined, undefined)
    );
    await pipe(
      setWithExpirationTask(
        redisClientMock as any,
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
    setMock.mockImplementationOnce((_, __, ___, ____, cb) =>
      cb(new Error("Cannot store key-value pair"), undefined)
    );
    await pipe(
      setWithExpirationTask(
        redisClientMock as any,
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
      getTask(redisClientMock as any, aRedisKey),
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
    getMock.mockImplementationOnce((_, cb) => cb(undefined, null));
    await pipe(
      getTask(redisClientMock as any, aRedisKey),
      TE.bimap(
        () => fail(),
        maybeResult => expect(O.isNone(maybeResult)).toBeTruthy()
      )
    )();
  });

  it("should return an error if redis get value fails", async () => {
    getMock.mockImplementationOnce((_, cb) =>
      cb(new Error("Cannot get value"), null)
    );
    await pipe(
      getTask(redisClientMock as any, aRedisKey),
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
      existsKeyTask(redisClientMock as any, aRedisKey),
      TE.bimap(
        () => fail(),
        exists => expect(exists).toBeTruthy()
      )
    )();
  });

  it("should return false if key does not exists in redis", async () => {
    existsMock.mockImplementationOnce((_, cb) => cb(null, 0));
    await pipe(
      existsKeyTask(redisClientMock as any, aRedisKey),
      TE.bimap(
        () => fail(),
        exists => expect(exists).toBeFalsy()
      )
    )();
  });

  it("should return an error if redis exists fails", async () => {
    existsMock.mockImplementationOnce((_, cb) =>
      cb(new Error("Cannot recognize exists on redis"), null)
    );
    await pipe(
      existsKeyTask(redisClientMock as any, aRedisKey),
      TE.bimap(
        _ => expect(_).toBeDefined(),
        () => fail()
      )
    )();
  });
});
