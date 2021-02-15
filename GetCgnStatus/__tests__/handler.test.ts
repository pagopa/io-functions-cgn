/* tslint:disable: no-any */

import * as date_fns from "date-fns";
import { some } from "fp-ts/lib/Option";
import { none } from "fp-ts/lib/Option";
import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { cgnActivatedDates, now } from "../../__mocks__/mock";
import {
  CardActivated,
  StatusEnum as ActivatedStatusEnum
} from "../../generated/definitions/CardActivated";
import {
  CardPending,
  StatusEnum as PendingStatusEnum
} from "../../generated/definitions/CardPending";
import {
  CardRevoked,
  StatusEnum as RevokedStatusEnum
} from "../../generated/definitions/CardRevoked";
import { UserCgn } from "../../models/user_cgn";
import { GetCgnStatusHandler } from "../handler";

const aFiscalCode = "RODFDS82S10H501T" as FiscalCode;
const aUserCgnId = "AN_ID" as NonEmptyString;

const findLastVersionByModelIdMock = jest.fn();
const userCgnModelMock = {
  findLastVersionByModelId: findLastVersionByModelIdMock
};

const aPendingCgn: CardPending = {
  status: PendingStatusEnum.PENDING
};

const aRevokedCgn: CardRevoked = {
  ...cgnActivatedDates,
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
  card: aPendingCgn,
  fiscalCode: aFiscalCode,
  id: aUserCgnId
};

const successImpl = async (userCgn: UserCgn) => {
  findLastVersionByModelIdMock.mockImplementationOnce(() =>
    taskEither.of(some(userCgn))
  );
  const handler = GetCgnStatusHandler(userCgnModelMock as any);
  const response = await handler({} as any, aFiscalCode);
  expect(response.kind).toBe("IResponseSuccessJson");
  if (response.kind === "IResponseSuccessJson") {
    expect(response.value).toEqual({
      ...userCgn.card
    });
  }
};
describe("GetCgnStatusHandler", () => {
  it("should return an internal error when a query error occurs", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      fromLeft(new Error("Query Error"))
    );
    const handler = GetCgnStatusHandler(userCgnModelMock as any);
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return not found if no userCgn is found", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(none)
    );
    const handler = GetCgnStatusHandler(userCgnModelMock as any);
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorNotFound");
  });

  it("should return success if a pending userCgn is found", async () => {
    await successImpl(aUserCgn);
  });
  it("should return success if a revoked userCgn is found", async () => {
    await successImpl({ ...aUserCgn, card: aRevokedCgn });
  });

  it("should return success if an activated userCgn is found", async () => {
    await successImpl({ ...aUserCgn, card: anActivatedCgn });
  });
});
