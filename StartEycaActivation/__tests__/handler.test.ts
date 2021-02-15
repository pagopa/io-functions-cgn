/* tslint:disable: no-any */
import { addYears } from "date-fns";
import { left, right } from "fp-ts/lib/Either";
import { none, some } from "fp-ts/lib/Option";
import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import { mockGetStatus, mockStartNew } from "../../__mocks__/durable-functions";
import {
  CardActivatedStatus,
  StatusEnum as ActivatedStatusEnum
} from "../../generated/definitions/CardActivatedStatus";
import { StatusEnum as PendingStatusEnum } from "../../generated/definitions/CardPendingStatus";
import { EycaCardActivatedStatus } from "../../generated/definitions/EycaCardActivatedStatus";
import { UserCgn } from "../../models/user_cgn";
import { UserEycaCard } from "../../models/user_eyca_card";
import * as checks from "../../utils/cgn_checks";
import * as orchUtils from "../../utils/orchestrators";

import { ResponseSuccessAccepted } from "italia-ts-commons/lib/responses";
import { StartEycaActivationHandler } from "../handler";

const aFiscalCode = "RODFDS89S10H501T" as FiscalCode;
const anEycaCardNumber = "AAAAA" as NonEmptyString;

const aUserCardActivatedStatus: CardActivatedStatus = {
  activation_date: new Date(),
  expiration_date: addYears(new Date(), 2),
  status: ActivatedStatusEnum.ACTIVATED
};

const aUserEycaCardActivatedStatus: EycaCardActivatedStatus = {
  activation_date: new Date(),
  card_number: anEycaCardNumber,
  expiration_date: addYears(new Date(), 2),
  status: ActivatedStatusEnum.ACTIVATED
};

const anActivatedUserCgn: UserCgn = {
  fiscalCode: aFiscalCode,
  id: "A_USER_CGN_ID" as NonEmptyString,
  status: aUserCardActivatedStatus
};

const aUserEycaCard: UserEycaCard = {
  cardStatus: aUserEycaCardActivatedStatus,
  fiscalCode: aFiscalCode
};

const findLastVersionByModelIdMock = jest
  .fn()
  .mockImplementation(() => taskEither.of(some(anActivatedUserCgn)));
const userCgnModelMock = {
  findLastVersionByModelId: findLastVersionByModelIdMock
};

const findLastVersionEycaByModelIdMock = jest
  .fn()
  .mockImplementation(() => taskEither.of(none));
const upsertMock = jest.fn().mockImplementation(() => taskEither.of({}));
const userEycaCardModelMock = {
  findLastVersionByModelId: findLastVersionEycaByModelIdMock,
  upsert: upsertMock
};
const checkUpdateCardIsRunningMock = jest
  .fn()
  .mockImplementation(() => taskEither.of(false));
jest
  .spyOn(orchUtils, "checkUpdateCardIsRunning")
  .mockImplementation(checkUpdateCardIsRunningMock);

const isEycaEligibleMock = jest.fn().mockImplementation(() => right(true));
jest.spyOn(checks, "isEycaEligible").mockImplementation(isEycaEligibleMock);

describe("StartEycaActivation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return an Internal Error if it is not possible to perform eyca eligibility check", async () => {
    isEycaEligibleMock.mockImplementationOnce(() =>
      left(new Error("Cannot recognize eligibility for EYCA"))
    );
    const startEycaActivationHandler = StartEycaActivationHandler(
      userEycaCardModelMock as any,
      userCgnModelMock as any
    );
    const response = await startEycaActivationHandler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return an Internal Error if it is not possible to get CGN info", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      fromLeft(new Error("Cannot read CGN info"))
    );
    const startEycaActivationHandler = StartEycaActivationHandler(
      userEycaCardModelMock as any,
      userCgnModelMock as any
    );
    const response = await startEycaActivationHandler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return Unauthorized the user is not eligible for EYCA", async () => {
    isEycaEligibleMock.mockImplementationOnce(() => right(false));
    const startEycaActivationHandler = StartEycaActivationHandler(
      userEycaCardModelMock as any,
      userCgnModelMock as any
    );
    const response = await startEycaActivationHandler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });
  it("should return Unauthorized if the user does not have a related CGN", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(none)
    );
    const startEycaActivationHandler = StartEycaActivationHandler(
      userEycaCardModelMock as any,
      userCgnModelMock as any
    );
    const response = await startEycaActivationHandler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });

  it("should return Unauthorized if the user does not have an ACTIVATED CGN", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(
        some({
          ...anActivatedUserCgn,
          status: { status: PendingStatusEnum.PENDING }
        })
      )
    );
    const startEycaActivationHandler = StartEycaActivationHandler(
      userEycaCardModelMock as any,
      userCgnModelMock as any
    );
    const response = await startEycaActivationHandler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });

  it("should return an Internal Error if it is not possible to get EYCA Card info", async () => {
    findLastVersionEycaByModelIdMock.mockImplementationOnce(() =>
      fromLeft(new Error("Cannot read EYCA info"))
    );
    const startEycaActivationHandler = StartEycaActivationHandler(
      userEycaCardModelMock as any,
      userCgnModelMock as any
    );
    const response = await startEycaActivationHandler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return a Conflict Error if an EYCA Card is already activated", async () => {
    findLastVersionEycaByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some(aUserEycaCard))
    );
    const startEycaActivationHandler = StartEycaActivationHandler(
      userEycaCardModelMock as any,
      userCgnModelMock as any
    );
    const response = await startEycaActivationHandler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorConflict");
  });

  it("should return an Internal Error if it is not possible to get EYCA Card activation status info", async () => {
    findLastVersionEycaByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(
        some({
          ...aUserEycaCard,
          cardStatus: { status: PendingStatusEnum.PENDING }
        })
      )
    );
    mockGetStatus.mockImplementationOnce(() => Promise.reject("An error"));
    const startEycaActivationHandler = StartEycaActivationHandler(
      userEycaCardModelMock as any,
      userCgnModelMock as any
    );
    const response = await startEycaActivationHandler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return an Internal Error if EYCA Card upsert fails", async () => {
    findLastVersionEycaByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(
        some({
          ...aUserEycaCard,
          cardStatus: { status: PendingStatusEnum.PENDING }
        })
      )
    );
    upsertMock.mockImplementationOnce(() =>
      fromLeft(new Error("Cannot upsert EYCA card"))
    );
    const startEycaActivationHandler = StartEycaActivationHandler(
      userEycaCardModelMock as any,
      userCgnModelMock as any
    );
    const response = await startEycaActivationHandler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorInternal");
  });
  it("should return an Internal Error if EYCA Card activation's orchestrator start fails", async () => {
    findLastVersionEycaByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(
        some({
          ...aUserEycaCard,
          cardStatus: { status: PendingStatusEnum.PENDING }
        })
      )
    );
    mockStartNew.mockImplementationOnce(() =>
      Promise.reject(new Error("Cannot start orchestrator"))
    );
    const startEycaActivationHandler = StartEycaActivationHandler(
      userEycaCardModelMock as any,
      userCgnModelMock as any
    );
    const response = await startEycaActivationHandler(
      // tslint:disable-next-line: no-console
      { log: { error: console.log } } as any,
      aFiscalCode
    );
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should start a new orchestrator if there aren' t conflict on the same id", async () => {
    const startEycaActivationHandler = StartEycaActivationHandler(
      userEycaCardModelMock as any,
      userCgnModelMock as any
    );
    await startEycaActivationHandler({} as any, aFiscalCode);
    expect(mockStartNew).toBeCalledTimes(1);
  });

  it("should return an Accepted response if there is another orchestrator running with the same id", async () => {
    checkUpdateCardIsRunningMock.mockImplementationOnce(() =>
      fromLeft(ResponseSuccessAccepted())
    );
    const startEycaActivationHandler = StartEycaActivationHandler(
      userEycaCardModelMock as any,
      userCgnModelMock as any
    );
    const response = await startEycaActivationHandler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseSuccessAccepted");
  });

  it("should return an Response redirect to resource response if all steps succeed", async () => {
    const startEycaActivationHandler = StartEycaActivationHandler(
      userEycaCardModelMock as any,
      userCgnModelMock as any
    );
    const response = await startEycaActivationHandler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseSuccessRedirectToResource");
  });
});
