/* eslint-disable @typescript-eslint/no-explicit-any */

import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { cgnActivatedDates } from "../../__mocks__/mock";
import {
  CardActivated,
  StatusEnum as ActivatedStatusEnum
} from "../../generated/definitions/CardActivated";
import {
  CardPending,
  StatusEnum as PendingStatusEnum
} from "../../generated/definitions/CardPending";
import { Otp } from "../../generated/definitions/Otp";
import { OtpCode } from "../../generated/definitions/OtpCode";
import { UserCgn } from "../../models/user_cgn";
import * as cgnCode from "../../utils/cgnCode";
import { GetGenerateOtpHandler } from "../handler";
import * as redis_util from "../redis";
import { RedisClientFactory } from "../../utils/redis";

const aFiscalCode = "RODFDS82S10H501T" as FiscalCode;
const aUserCgnId = "AN_ID" as NonEmptyString;
const aDefaultOtpTtl = 6000 as NonNegativeInteger;
const anOtpCode = "AAAAAAAA123" as OtpCode;

const aPendingCgn: CardPending = {
  status: PendingStatusEnum.PENDING
};

const anActivatedCgn: CardActivated = {
  ...cgnActivatedDates,
  status: ActivatedStatusEnum.ACTIVATED
};

const aUserCgn: UserCgn = {
  card: aPendingCgn,
  fiscalCode: aFiscalCode,
  id: aUserCgnId
};

const anOtp: Otp = {
  code: anOtpCode,
  expires_at: new Date(),
  ttl: 10
};

const storeOtpAndRelatedFiscalCodeMock = jest
  .fn()
  .mockImplementation(() => TE.of(true));

const retrieveOtpByFiscalCodeMock = jest
  .fn()
  .mockImplementation(() => TE.of(O.none));

jest
  .spyOn(redis_util, "retrieveOtpByFiscalCode")
  .mockImplementation(retrieveOtpByFiscalCodeMock);

jest
  .spyOn(redis_util, "storeOtpAndRelatedFiscalCode")
  .mockImplementation(storeOtpAndRelatedFiscalCodeMock);

const findLastVersionByModelIdMock = jest
  .fn()
  .mockImplementation(() =>
    TE.of(O.some({ ...aUserCgn, card: anActivatedCgn }))
  );

const userCgnModelMock = {
  findLastVersionByModelId: findLastVersionByModelIdMock
};

const generateOtpCodeMock = jest
  .fn()
  .mockImplementation(() => Promise.resolve(anOtpCode));
jest.spyOn(cgnCode, "generateOtpCode").mockImplementation(generateOtpCodeMock);

const successImpl = async () => {
  const handler = GetGenerateOtpHandler(
    userCgnModelMock as any,
    redisClientFactoryMock,
    aDefaultOtpTtl
  );
  const response = await handler({} as any, aFiscalCode);
  expect(response.kind).toBe("IResponseSuccessJson");
  if (response.kind === "IResponseSuccessJson") {
    expect(response.value).toMatchObject({
      code: anOtp.code
    });
  }
};

const redisClientFactoryMock = {
  getInstance: jest.fn()
} as unknown as RedisClientFactory;

describe("GetGenerateOtpHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should return an internal error when a query error occurs", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      TE.left(new Error("Query Error"))
    );
    const handler = GetGenerateOtpHandler(
      userCgnModelMock as any,
      redisClientFactoryMock,
      aDefaultOtpTtl
    );
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return an internal error if OTP generation fails", async () => {
    generateOtpCodeMock.mockImplementationOnce(() =>
      Promise.reject(new Error("Cannot generate OTP"))
    );
    const handler = GetGenerateOtpHandler(
      userCgnModelMock as any,
      redisClientFactoryMock,
      aDefaultOtpTtl
    );
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return an internal error if Redis OTP store fails", async () => {
    storeOtpAndRelatedFiscalCodeMock.mockImplementationOnce(() =>
      TE.left(new Error("Cannot store OTP on Redis"))
    );
    const handler = GetGenerateOtpHandler(
      userCgnModelMock as any,
      redisClientFactoryMock,
      aDefaultOtpTtl
    );
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return an internal error if Redis OTP retrieve fails", async () => {
    retrieveOtpByFiscalCodeMock.mockImplementationOnce(() =>
      TE.left(new Error("Cannot retrieve OTP on Redis"))
    );
    const handler = GetGenerateOtpHandler(
      userCgnModelMock as any,
      redisClientFactoryMock,
      aDefaultOtpTtl
    );
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return forbidden if no userCgn is found", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() => TE.of(O.none));
    const handler = GetGenerateOtpHandler(
      userCgnModelMock as any,
      redisClientFactoryMock,
      aDefaultOtpTtl
    );
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });

  it("should return Forbidden if a pending userCgn is found", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      TE.of(O.some(aUserCgn))
    );
    const handler = GetGenerateOtpHandler(
      userCgnModelMock as any,
      redisClientFactoryMock,
      aDefaultOtpTtl
    );
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });

  it("should return success with a previous stored OTP if it is present", async () => {
    retrieveOtpByFiscalCodeMock.mockImplementationOnce(() =>
      TE.of(O.some(anOtp))
    );
    const handler = GetGenerateOtpHandler(
      userCgnModelMock as any,
      redisClientFactoryMock,
      aDefaultOtpTtl
    );
    const response = await handler({} as any, aFiscalCode);
    expect(storeOtpAndRelatedFiscalCodeMock).not.toHaveBeenCalled();
    expect(response.kind).toBe("IResponseSuccessJson");
    if (response.kind === "IResponseSuccessJson") {
      expect(response.value).toEqual(anOtp);
    }
  });
  it("should return success if an activated userCgn is found and an OTP has been generated", async () => {
    await successImpl();
  });
});
