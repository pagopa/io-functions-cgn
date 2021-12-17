// eslint-disable @typescript-eslint/no-explicit-any

import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
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
  .mockImplementation(() => TE.of(true));

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
  .mockImplementation(() => TE.of(O.some(anOtpCode)));
jest.spyOn(redis_storage, "getTask").mockImplementation(getTaskMock);

describe("storeOtpAndRelatedFiscalCode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should return an error when otp store fails", async () => {
    setWithExpirationTaskMock.mockImplementationOnce(() =>
      TE.left(new Error("Cannot store OTP"))
    );
    await pipe(
      storeOtpAndRelatedFiscalCode(
        {} as any,
        anOtpCode,
        anOtpPayload,
        anOtpTtl
      ),
      TE.bimap(
        _ => expect(_).toBeDefined(),
        () => fail()
      )
    )();
  });

  it("should return an error when otp related fiscalCode store fails", async () => {
    setWithExpirationTaskMock.mockImplementationOnce(() => TE.of(true));
    setWithExpirationTaskMock.mockImplementationOnce(() =>
      TE.left(new Error("Cannot store OTP related Fiscal Code"))
    );
    await pipe(
      storeOtpAndRelatedFiscalCode(
        {} as any,
        anOtpCode,
        anOtpPayload,
        anOtpTtl
      ),
      TE.bimap(
        _ => expect(_).toBeDefined(),
        () => fail()
      )
    )();
  });

  it("should return true if OTP store success", async () => {
    setWithExpirationTaskMock.mockImplementationOnce(() => TE.of(true));
    setWithExpirationTaskMock.mockImplementationOnce(() => TE.of(true));
    await pipe(
      storeOtpAndRelatedFiscalCode(
        {} as any,
        anOtpCode,
        anOtpPayload,
        anOtpTtl
      ),
      TE.bimap(
        () => fail(),
        _ => expect(_).toEqual(true)
      )
    )();
  });
});

describe("retrieveOtpByFiscalCode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should return an error when fiscalCode retrieve fails", async () => {
    getTaskMock.mockImplementationOnce(() =>
      TE.left(new Error("Cannot retrieve OTP"))
    );
    await pipe(
      retrieveOtpByFiscalCode({} as any, aFiscalCode),
      TE.bimap(
        _ => expect(_).toBeDefined(),
        () => fail()
      )
    )();
  });

  it("should return none if fiscalCode does not hit on Redis", async () => {
    getTaskMock.mockImplementationOnce(() => TE.of(O.none));
    await pipe(
      retrieveOtpByFiscalCode({} as any, aFiscalCode),
      TE.bimap(
        () => fail(),
        _ => expect(O.isNone(_)).toBeTruthy()
      )
    )();
  });

  it("should return an error when if error occurs while retrieving related fiscalCode's OTP", async () => {
    getTaskMock.mockImplementationOnce(() => TE.of(O.some(anOtpCode)));
    getTaskMock.mockImplementationOnce(() =>
      TE.left(new Error("Cannot retrieve OTP code"))
    );
    await pipe(
      retrieveOtpByFiscalCode({} as any, aFiscalCode),
      TE.bimap(
        _ => expect(_).toBeDefined(),
        () => fail()
      )
    )();
  });

  it("should return none if fiscalCode's related OTP does not hit on Redis", async () => {
    getTaskMock.mockImplementationOnce(() => TE.of(O.some(anOtpCode)));
    getTaskMock.mockImplementationOnce(() => TE.of(O.none));
    await pipe(
      retrieveOtpByFiscalCode({} as any, aFiscalCode),
      TE.bimap(
        () => fail(),
        _ => expect(O.isNone(_)).toBeTruthy()
      )
    )();
  });

  it("should return an error if Error payload is invalid", async () => {
    getTaskMock.mockImplementationOnce(() => TE.of(O.some(anOtpCode)));
    getTaskMock.mockImplementationOnce(() =>
      TE.of(O.some("an invalid Payload"))
    );
    await pipe(
      retrieveOtpByFiscalCode({} as any, aFiscalCode),
      TE.bimap(
        _ => {
          expect(_).toBeDefined();
          expect(_.message).toContain("Unexpected token");
        },
        () => fail()
      )
    )();
  });

  it("should return an error if Otp decode fails", async () => {
    getTaskMock.mockImplementationOnce(() => TE.of(O.some(anOtpCode)));
    getTaskMock.mockImplementationOnce(() =>
      TE.of(O.some(JSON.stringify({ ...anOtpPayload, ttl: "an invalid ttl" })))
    );
    await pipe(
      retrieveOtpByFiscalCode({} as any, aFiscalCode),
      TE.bimap(
        _ => expect(_).toBeDefined(),
        () => fail()
      )
    )();
  });

  it("should return a retrieved Otp if success", async () => {
    getTaskMock.mockImplementationOnce(() => TE.of(O.some(anOtpCode)));
    getTaskMock.mockImplementationOnce(() =>
      TE.of(O.some(JSON.stringify({ ...anOtpPayload })))
    );
    await pipe(
      retrieveOtpByFiscalCode({} as any, aFiscalCode),
      TE.bimap(
        () => fail(),

        O.fold(
          () => fail("OTP Cannot be none"),
          value => expect(value).toEqual(anOtp)
        )
      )
    )();
  });
});
