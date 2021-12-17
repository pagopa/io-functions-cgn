/* eslint-disable @typescript-eslint/no-explicit-any */
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as date_fns from "date-fns";
import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { cgnActivatedDates, now } from "../../__mocks__/mock";
import {
  CardActivated,
  StatusEnum as ActivatedStatusEnum
} from "../../generated/definitions/CardActivated";
import {
  CardPending,
  StatusEnum as PendingStatusEnum
} from "../../generated/definitions/CardPending";
import { StatusEnum as RevokedStatusEnum } from "../../generated/definitions/CardRevoked";
import { CcdbNumber } from "../../generated/definitions/CcdbNumber";
import { EycaCardActivated } from "../../generated/definitions/EycaCardActivated";
import { EycaCardRevoked } from "../../generated/definitions/EycaCardRevoked";
import { UserCgn } from "../../models/user_cgn";
import { UserEycaCard } from "../../models/user_eyca_card";
import * as cgn_checks from "../../utils/cgn_checks";
import { DEFAULT_EYCA_UPPER_BOUND_AGE } from "../../utils/config";
import { GetEycaStatusHandler } from "../handler";

const aFiscalCode = "RODFDS82S10H501T" as FiscalCode;
const aUserEycaCardNumber = "A123-A123-A123-A123" as CcdbNumber;
const aUserCgnId = "AN_ID" as NonEmptyString;

const aPendingEycaCard: CardPending = {
  status: PendingStatusEnum.PENDING
};

const aUserEycaCard: UserEycaCard = {
  card: aPendingEycaCard,
  fiscalCode: aFiscalCode
};

const aRevokedEycaCard: EycaCardRevoked = {
  ...cgnActivatedDates,
  card_number: aUserEycaCardNumber,
  revocation_date: now,
  revocation_reason: "A motivation" as NonEmptyString,
  status: RevokedStatusEnum.REVOKED
};

const anActivatedCgn: CardActivated = {
  activation_date: now,
  expiration_date: date_fns.addDays(now, 10),
  status: ActivatedStatusEnum.ACTIVATED
};

const aUserCgn: UserCgn = {
  card: anActivatedCgn,
  fiscalCode: aFiscalCode,
  id: aUserCgnId
};

const findLastVersionByModelIdMock = jest
  .fn()
  .mockImplementation(() => TE.of(O.some(aUserEycaCard)));
const userEycaCardModelMock = {
  findLastVersionByModelId: findLastVersionByModelIdMock
};

const findLastVersionCgnByModelIdMock = jest
  .fn()
  .mockImplementation(() => TE.of(O.some(aUserCgn)));
const userCgnModelMock = {
  findLastVersionByModelId: findLastVersionCgnByModelIdMock
};

const anActivatedEycaCard: EycaCardActivated = {
  activation_date: now,
  card_number: aUserEycaCardNumber,
  expiration_date: date_fns.addDays(now, 10),
  status: ActivatedStatusEnum.ACTIVATED
};
const isEycaEligibleMock = jest.fn().mockImplementation(() => E.right(true));
jest.spyOn(cgn_checks, "isEycaEligible").mockImplementation(isEycaEligibleMock);

const successImpl = async (userEycaCard: UserEycaCard) => {
  const handler = GetEycaStatusHandler(
    userEycaCardModelMock as any,
    userCgnModelMock as any,
    DEFAULT_EYCA_UPPER_BOUND_AGE
  );
  const response = await handler({} as any, aFiscalCode);
  expect(response.kind).toBe("IResponseSuccessJson");
  if (response.kind === "IResponseSuccessJson") {
    expect(response.value).toEqual({
      ...userEycaCard.card
    });
  }
};
describe("GetEycaCardStatusHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return success if a revoked userEycaCard is found", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      TE.of(O.some({ ...aUserEycaCard, card: aRevokedEycaCard }))
    );
    await successImpl({ ...aUserEycaCard, card: aRevokedEycaCard });
  });

  it("should return success if an activated userEycaCard is found", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      TE.of(O.some({ ...aUserEycaCard, card: anActivatedEycaCard }))
    );
    await successImpl({ ...aUserEycaCard, card: anActivatedEycaCard });
  });

  it("should return success if a pending userEycaCard is found", async () => {
    await successImpl(aUserEycaCard);
  });

  it("should return an internal error when a query error occurs", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      TE.left(new Error("Query Error"))
    );
    const handler = GetEycaStatusHandler(
      userEycaCardModelMock as any,
      userCgnModelMock as any,
      DEFAULT_EYCA_UPPER_BOUND_AGE
    );
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return an internal error if EYCA eligible check fails", async () => {
    isEycaEligibleMock.mockImplementationOnce(() =>
      E.left(new Error("Connt perform EYCA eligibility check"))
    );
    const handler = GetEycaStatusHandler(
      userEycaCardModelMock as any,
      userCgnModelMock as any,
      DEFAULT_EYCA_UPPER_BOUND_AGE
    );
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return an internal error if query errors occurs on CGN", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() => TE.of(O.none));
    findLastVersionCgnByModelIdMock.mockImplementationOnce(() =>
      TE.left(new Error("Query Error"))
    );
    const handler = GetEycaStatusHandler(
      userEycaCardModelMock as any,
      userCgnModelMock as any,
      DEFAULT_EYCA_UPPER_BOUND_AGE
    );
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return Not found if EYCA and CGN cards are missing", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() => TE.of(O.none));
    findLastVersionCgnByModelIdMock.mockImplementationOnce(() => TE.of(O.none));
    const handler = GetEycaStatusHandler(
      userEycaCardModelMock as any,
      userCgnModelMock as any,
      DEFAULT_EYCA_UPPER_BOUND_AGE
    );
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorNotFound");
  });

  it("should return Not found if EYCA card is missing and CGN card is Pending", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() => TE.of(O.none));
    findLastVersionCgnByModelIdMock.mockImplementationOnce(() =>
      TE.of(O.some({ ...aUserCgn, card: aPendingEycaCard }))
    );
    const handler = GetEycaStatusHandler(
      userEycaCardModelMock as any,
      userCgnModelMock as any,
      DEFAULT_EYCA_UPPER_BOUND_AGE
    );
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorNotFound");
  });

  it("should return not authorized if no userEycaCard is found and user is not eligible to get it", async () => {
    isEycaEligibleMock.mockImplementationOnce(() => E.right(false));
    const handler = GetEycaStatusHandler(
      userEycaCardModelMock as any,
      userCgnModelMock as any,
      DEFAULT_EYCA_UPPER_BOUND_AGE
    );
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });

  it("should return conflict if no userEycaCard is found and CGN is already activated", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() => TE.of(O.none));
    const handler = GetEycaStatusHandler(
      userEycaCardModelMock as any,
      userCgnModelMock as any,
      DEFAULT_EYCA_UPPER_BOUND_AGE
    );
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorConflict");
  });

  it("should return internal error if no userEycaCard is found and eligibility check on user fails", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() => TE.of(O.none));
    isEycaEligibleMock.mockImplementationOnce(() =>
      E.left(new Error("Cannot recognize EYCA eligibility"))
    );
    const handler = GetEycaStatusHandler(
      userEycaCardModelMock as any,
      userCgnModelMock as any,
      DEFAULT_EYCA_UPPER_BOUND_AGE
    );
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorInternal");
  });
});
