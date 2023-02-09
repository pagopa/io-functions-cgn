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

const setExMock = jest.fn().mockImplementation((_, __, ___) => "OK");
const getMock = jest.fn().mockImplementation(_ => aRedisValue);
const existsMock = jest.fn().mockImplementation(_ => 1);
const redisClientMock = {
  exists: existsMock,
  get: getMock,
  set: setExMock
};

describe("setWithExpirationTask", () => {
  it("should return true if redis store key-value pair correctly", () => {
    pipe(
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
    );
  });

  it("should return an error if redis store key-value pair returns undefined", () => {
    setExMock.mockImplementationOnce((_, __, ___) => undefined);
    pipe(
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
    );
  });

  it("should return an error if redis store key-value pair fails", () => {
    setExMock.mockImplementationOnce(
      (_, __, ___) => new Error("Cannot store key-value pair")
    );
    pipe(
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
    );
  });
});

describe("getTask", () => {
  it("should return a value if redis get key-value pair correctly", () => {
    pipe(
      getTask(redisClientMock as any, aRedisKey),
      TE.bimap(
        () => fail(),
        O.fold(
          () => fail(),
          value => expect(value).toEqual(aRedisValue)
        )
      )
    );
  });

  it("should return none if no value was found for the provided key", () => {
    getMock.mockImplementationOnce(_ => undefined);
    pipe(
      getTask(redisClientMock as any, aRedisKey),
      TE.bimap(
        () => fail(),
        maybeResult => expect(O.isNone(maybeResult)).toBeTruthy()
      )
    );
  });

  it("should return an error if redis get value fails", () => {
    getMock.mockImplementationOnce(_ => new Error("Cannot get value"));
    pipe(
      getTask(redisClientMock as any, aRedisKey),
      TE.bimap(
        _ => expect(_).toBeDefined(),
        () => fail()
      )
    );
  });
});

describe("existsTask", () => {
  it("should return true if key exists in redis", () => {
    pipe(
      existsKeyTask(redisClientMock as any, aRedisKey),
      TE.bimap(
        () => fail(),
        exists => expect(exists).toBeTruthy()
      )
    );
  });

  it("should return false if key does not exists in redis", () => {
    existsMock.mockImplementationOnce(_ => 0);
    pipe(
      existsKeyTask(redisClientMock as any, aRedisKey),
      TE.bimap(
        () => fail(),
        exists => expect(exists).toBeFalsy()
      )
    );
  });

  it("should return an error if redis exists fails", () => {
    existsMock.mockImplementationOnce(
      _ => new Error("Cannot recognize exists on redis")
    );
    pipe(
      existsKeyTask(redisClientMock as any, aRedisKey),
      TE.bimap(
        _ => expect(_).toBeDefined(),
        () => fail()
      )
    );
  });
});
