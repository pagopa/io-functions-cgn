/* tslint:disable: no-any */

import * as date_fns from "date-fns";
import { some } from "fp-ts/lib/Option";
import { none } from "fp-ts/lib/Option";
import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { cgnActivatedDates, now } from "../../__mocks__/mock";
import { StatusEnum as ActivatedStatusEnum } from "../../generated/definitions/CardActivated";
import {
  CardPending,
  StatusEnum as PendingStatusEnum
} from "../../generated/definitions/CardPending";
import { StatusEnum as RevokedStatusEnum } from "../../generated/definitions/CardRevoked";
import { EycaCardActivated } from "../../generated/definitions/EycaCardActivated";
import { EycaCardRevoked } from "../../generated/definitions/EycaCardRevoked";
import { UserEycaCard, UserEycaCardModel } from "../../models/user_eyca_card";
import { GetEycaStatusHandler } from "../handler";

const aFiscalCode = "RODFDS82S10H501T" as FiscalCode;
const aUserEycaCardNumber = "AN_ID" as NonEmptyString;

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

const findLastVersionByModelIdMock = jest
  .fn()
  .mockImplementation(() => taskEither.of(some(aUserEycaCard)));
const userEycaCardModelMock = {
  findLastVersionByModelId: findLastVersionByModelIdMock
};

const anActivatedEycaCard: EycaCardActivated = {
  activation_date: now,
  card_number: aUserEycaCardNumber,
  expiration_date: date_fns.addDays(now, 10),
  status: ActivatedStatusEnum.ACTIVATED
};

const successImpl = async (userEycaCard: UserEycaCard) => {
  const handler = GetEycaStatusHandler(userEycaCardModelMock as any);
  const response = await handler({} as any, aFiscalCode);
  expect(response.kind).toBe("IResponseSuccessJson");
  if (response.kind === "IResponseSuccessJson") {
    expect(response.value).toEqual({
      ...userEycaCard.card
    });
  }
};
describe("GetEycaCardStatusHandler", () => {
  it("should return an internal error when a query error occurs", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      fromLeft(new Error("Query Error"))
    );
    const handler = GetEycaStatusHandler(userEycaCardModelMock as any);
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return not found if no userEycaCard is found", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(none)
    );
    const handler = GetEycaStatusHandler(userEycaCardModelMock as any);
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorNotFound");
  });

  it("should return success if a pending userEycaCard is found", async () => {
    await successImpl(aUserEycaCard);
  });

  it("should return success if a revoked userEycaCard is found", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some({ ...aUserEycaCard, card: aRevokedEycaCard }))
    );
    await successImpl({ ...aUserEycaCard, card: aRevokedEycaCard });
  });

  it("should return success if an activated userEycaCard is found", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some({ ...aUserEycaCard, card: anActivatedEycaCard }))
    );
    await successImpl({ ...aUserEycaCard, card: anActivatedEycaCard });
  });
});
