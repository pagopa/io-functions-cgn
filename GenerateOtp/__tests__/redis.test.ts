// tslint:disable: no-any

import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { fromLeft } from "fp-ts/lib/IOEither";
import { isNone, none, some } from "fp-ts/lib/Option";
import { taskEither } from "fp-ts/lib/TaskEither";
import { aFiscalCode } from "../../__mocks__/mock";
import { Otp } from "../../generated/definitions/Otp";
import { OtpCode } from "../../generated/definitions/OtpCode";
import * as redis_storage from "../../utils/redis_storage";
import {
  OtpPayload,
  retrieveOtpByFiscalCode,
  storeOtpAndRelatedFiscalCode
} from "../redis";
const anOtpTtl = 10 as NonNegativeInteger;
const anOtpCode = "1234567890A" as OtpCode;
const setWithExpirationTaskMock = jest
  .fn()
  .mockImplementation(() => taskEither.of(true));

jest
  .spyOn(redis_storage, "setWithExpirationTask")
  .mockImplementation(setWithExpirationTaskMock);

const anOtp: Otp = {
  code: anOtpCode,
  expires_at: new Date(),
  ttl: anOtpTtl
};

const anOtpPayload: OtpPayload = {
  expiresAt: anOtp.expires_at,
  fiscalCode: aFiscalCode,
  ttl: anOtpTtl
};
const getTaskMock = jest
  .fn()
  .mockImplementation(() => taskEither.of(some(anOtpCode)));
jest.spyOn(redis_storage, "getTask").mockImplementation(getTaskMock);

describe("storeOtpAndRelatedFiscalCode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should return an error when otp store fails", async () => {
    setWithExpirationTaskMock.mockImplementationOnce(() =>
      fromLeft(new Error("Cannot store OTP"))
    );
    await storeOtpAndRelatedFiscalCode(
      {} as any,
      anOtpCode,
      anOtpPayload,
      anOtpTtl
    )
      .fold(
        _ => expect(_).toBeDefined(),
        () => fail()
      )
      .run();
  });

  it("should return an error when otp related fiscalCode store fails", async () => {
    setWithExpirationTaskMock.mockImplementationOnce(() => taskEither.of(true));
    setWithExpirationTaskMock.mockImplementationOnce(() =>
      fromLeft(new Error("Cannot store OTP related Fiscal Code"))
    );
    await storeOtpAndRelatedFiscalCode(
      {} as any,
      anOtpCode,
      anOtpPayload,
      anOtpTtl
    )
      .fold(
        _ => expect(_).toBeDefined(),
        () => fail()
      )
      .run();
  });

  it("should return true if OTP store success", async () => {
    setWithExpirationTaskMock.mockImplementationOnce(() => taskEither.of(true));
    setWithExpirationTaskMock.mockImplementationOnce(() => taskEither.of(true));
    await storeOtpAndRelatedFiscalCode(
      {} as any,
      anOtpCode,
      anOtpPayload,
      anOtpTtl
    )
      .fold(
        () => fail(),
        _ => expect(_).toEqual(true)
      )
      .run();
  });
});

describe("retrieveOtpByFiscalCode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should return an error when fiscalCode retrieve fails", async () => {
    getTaskMock.mockImplementationOnce(() =>
      fromLeft(new Error("Cannot retrieve OTP"))
    );
    await retrieveOtpByFiscalCode({} as any, aFiscalCode)
      .fold(
        _ => expect(_).toBeDefined(),
        () => fail()
      )
      .run();
  });

  it("should return none if fiscalCode does not hit on Redis", async () => {
    getTaskMock.mockImplementationOnce(() => taskEither.of(none));
    await retrieveOtpByFiscalCode({} as any, aFiscalCode)
      .fold(
        () => fail(),
        _ => expect(isNone(_)).toBeTruthy()
      )
      .run();
  });

  it("should return an error when if error occurs while retrieving related fiscalCode's OTP", async () => {
    getTaskMock.mockImplementationOnce(() => taskEither.of(some(anOtpCode)));
    getTaskMock.mockImplementationOnce(() =>
      fromLeft(new Error("Cannot retrieve OTP code"))
    );
    await retrieveOtpByFiscalCode({} as any, aFiscalCode)
      .fold(
        _ => expect(_).toBeDefined(),
        () => fail()
      )
      .run();
  });

  it("should return none if fiscalCode's related OTP does not hit on Redis", async () => {
    getTaskMock.mockImplementationOnce(() => taskEither.of(some(anOtpCode)));
    getTaskMock.mockImplementationOnce(() => taskEither.of(none));
    await retrieveOtpByFiscalCode({} as any, aFiscalCode)
      .fold(
        () => fail(),
        _ => expect(isNone(_)).toBeTruthy()
      )
      .run();
  });

  it("should return an error if Error payload is invalid", async () => {
    getTaskMock.mockImplementationOnce(() => taskEither.of(some(anOtpCode)));
    getTaskMock.mockImplementationOnce(() =>
      taskEither.of(some("an invalid Payload"))
    );
    await retrieveOtpByFiscalCode({} as any, aFiscalCode)
      .fold(
        _ => {
          expect(_).toBeDefined();
          expect(_.message).toContain("Unexpected token");
        },
        () => fail()
      )
      .run();
  });

  it("should return an error if Otp decode fails", async () => {
    getTaskMock.mockImplementationOnce(() => taskEither.of(some(anOtpCode)));
    getTaskMock.mockImplementationOnce(() =>
      taskEither.of(
        some(JSON.stringify({ ...anOtpPayload, ttl: "an invalid ttl" }))
      )
    );
    await retrieveOtpByFiscalCode({} as any, aFiscalCode)
      .fold(
        _ => expect(_).toBeDefined(),
        () => fail()
      )
      .run();
  });

  it("should return a retrieved Otp if success", async () => {
    getTaskMock.mockImplementationOnce(() => taskEither.of(some(anOtpCode)));
    getTaskMock.mockImplementationOnce(() =>
      taskEither.of(some(JSON.stringify({ ...anOtpPayload })))
    );
    await retrieveOtpByFiscalCode({} as any, aFiscalCode)
      .fold(
        () => fail(),
        _ =>
          _.foldL(
            () => fail("OTP Cannot be none"),
            value => expect(value).toEqual(anOtp)
          )
      )
      .run();
  });
});
