/* tslint:disable: no-any */

import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { some } from "fp-ts/lib/Option";
import { none } from "fp-ts/lib/Option";
import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
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
import * as redis_storage from "../../utils/redis_storage";
import { GetGenerateOtpHandler } from "../handler";

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

const setWithExpirationTaskMock = jest
  .fn()
  .mockImplementation(() => taskEither.of(true));
jest
  .spyOn(redis_storage, "setWithExpirationTask")
  .mockImplementation(setWithExpirationTaskMock);

const findLastVersionByModelIdMock = jest
  .fn()
  .mockImplementation(() =>
    taskEither.of(some({ ...aUserCgn, card: anActivatedCgn }))
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
    {} as any,
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
describe("GetGenerateOtpHandler", () => {
  it("should return an internal error when a query error occurs", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      fromLeft(new Error("Query Error"))
    );
    const handler = GetGenerateOtpHandler(
      userCgnModelMock as any,
      {} as any,
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
      {} as any,
      aDefaultOtpTtl
    );
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return an internal error if Redis OTP store fails", async () => {
    setWithExpirationTaskMock.mockImplementationOnce(() =>
      fromLeft(new Error("Cannot store OTP on Redis"))
    );
    const handler = GetGenerateOtpHandler(
      userCgnModelMock as any,
      {} as any,
      aDefaultOtpTtl
    );
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return forbidden if no userCgn is found", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(none)
    );
    const handler = GetGenerateOtpHandler(
      userCgnModelMock as any,
      {} as any,
      aDefaultOtpTtl
    );
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });

  it("should return Forbidden if a pending userCgn is found", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some(aUserCgn))
    );
    const handler = GetGenerateOtpHandler(
      userCgnModelMock as any,
      {} as any,
      aDefaultOtpTtl
    );
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });
  it("should return success if an activated userCgn is found and an OTP has been generated", async () => {
    await successImpl();
  });
});
