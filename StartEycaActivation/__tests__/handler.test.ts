/* tslint:disable: no-any */
import { addYears } from "date-fns";
import { left, right } from "fp-ts/lib/Either";
import { none, some } from "fp-ts/lib/Option";
import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { mockGetStatus, mockStartNew } from "../../__mocks__/durable-functions";
import {
  CardActivated,
  StatusEnum as ActivatedStatusEnum
} from "../../generated/definitions/CardActivated";
import { StatusEnum as PendingStatusEnum } from "../../generated/definitions/CardPending";
import { EycaCardActivated } from "../../generated/definitions/EycaCardActivated";
import { UserCgn } from "../../models/user_cgn";
import { UserEycaCard } from "../../models/user_eyca_card";
import * as checks from "../../utils/cgn_checks";
import * as orchUtils from "../../utils/orchestrators";

import { ResponseSuccessAccepted } from "@pagopa/ts-commons/lib/responses";
import { CcdbNumber } from "../../generated/definitions/CcdbNumber";
import * as cgn_checks from "../../utils/cgn_checks";
import { DEFAULT_EYCA_UPPER_BOUND_AGE } from "../../utils/config";
import { ReturnTypes, StartEycaActivationHandler } from "../handler";

const aFiscalCode = "RODFDS89S10H501T" as FiscalCode;
const anEycaCardNumber = "A123-A123-A123-A123" as CcdbNumber;

const aUserCardActivated: CardActivated = {
  activation_date: new Date(),
  expiration_date: addYears(new Date(), 2),
  status: ActivatedStatusEnum.ACTIVATED
};

const aUserEycaCardActivated: EycaCardActivated = {
  activation_date: new Date(),
  card_number: anEycaCardNumber,
  expiration_date: addYears(new Date(), 2),
  status: ActivatedStatusEnum.ACTIVATED
};

const anActivatedUserCgn: UserCgn = {
  card: aUserCardActivated,
  fiscalCode: aFiscalCode,
  id: "A_USER_CGN_ID" as NonEmptyString
};

const aUserEycaCard: UserEycaCard = {
  card: aUserEycaCardActivated,
  fiscalCode: aFiscalCode
};

const findLastVersionByModelIdMock = jest
  .fn()
  .mockImplementation(() => taskEither.of(some(anActivatedUserCgn)));
const userCgnModelMock = {
  findLastVersionByModelId: findLastVersionByModelIdMock
};

const extractEycaExpirationDateMock = jest
  .spyOn(cgn_checks, "extractEycaExpirationDate")
  .mockImplementation(() => right(addYears(new Date(), 5)));

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

const startHandler = (): Promise<ReturnTypes> => {
  const startEycaActivationHandler = StartEycaActivationHandler(
    userEycaCardModelMock as any,
    userCgnModelMock as any,
    DEFAULT_EYCA_UPPER_BOUND_AGE
  );
  return startEycaActivationHandler({} as any, aFiscalCode);
};

describe("StartEycaActivation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return an Internal Error if it is not possible to perform eyca eligibility check", async () => {
    isEycaEligibleMock.mockImplementationOnce(() =>
      left(new Error("Cannot recognize eligibility for EYCA"))
    );
    const response = await startHandler();
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return an Internal Error if it is not possible to get CGN info", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      fromLeft(new Error("Cannot read CGN info"))
    );
    const response = await startHandler();
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return Unauthorized the user is not eligible for EYCA", async () => {
    isEycaEligibleMock.mockImplementationOnce(() => right(false));
    const response = await startHandler();
    expect(response.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });
  it("should return Unauthorized if the user does not have a related CGN", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(none)
    );
    const response = await startHandler();
    expect(response.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });

  it("should return Unauthorized if the user does not have an ACTIVATED CGN", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(
        some({
          ...anActivatedUserCgn,
          card: { status: PendingStatusEnum.PENDING }
        })
      )
    );
    const response = await startHandler();
    expect(response.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });

  it("should return an Internal Error if it is not possible to get EYCA Card info", async () => {
    findLastVersionEycaByModelIdMock.mockImplementationOnce(() =>
      fromLeft(new Error("Cannot read EYCA info"))
    );
    const response = await startHandler();
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return an Internal Error if it is not possible to calculate Expiration Date from FiscalCode", async () => {
    extractEycaExpirationDateMock.mockImplementationOnce(() =>
      left(new Error("Cannot extract date"))
    );

    const response = await startHandler();
    expect(response.kind).toBe("IResponseErrorInternal");

    if (response.kind === "IResponseErrorInternal") {
      expect(response.detail).toBe(
        "Internal server error: Error extracting Expiration Date from Fiscal Code"
      );
    }
  });

  it("should return a Conflict Error if an EYCA Card is already activated", async () => {
    findLastVersionEycaByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some(aUserEycaCard))
    );
    const response = await startHandler();
    expect(response.kind).toBe("IResponseErrorConflict");
  });

  it("should return an Internal Error if it is not possible to get EYCA Card activation status info", async () => {
    findLastVersionEycaByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(
        some({
          ...aUserEycaCard,
          card: { status: PendingStatusEnum.PENDING }
        })
      )
    );
    mockGetStatus.mockImplementationOnce(() => Promise.reject("An error"));
    const response = await startHandler();
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return an Internal Error if EYCA Card upsert fails", async () => {
    findLastVersionEycaByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(
        some({
          ...aUserEycaCard,
          card: { status: PendingStatusEnum.PENDING }
        })
      )
    );
    upsertMock.mockImplementationOnce(() =>
      fromLeft(new Error("Cannot upsert EYCA card"))
    );
    const response = await startHandler();
    expect(response.kind).toBe("IResponseErrorInternal");
  });
  it("should return an Internal Error if EYCA Card activation's orchestrator start fails", async () => {
    findLastVersionEycaByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(
        some({
          ...aUserEycaCard,
          card: { status: PendingStatusEnum.PENDING }
        })
      )
    );
    mockStartNew.mockImplementationOnce(() =>
      Promise.reject(new Error("Cannot start orchestrator"))
    );
    const startEycaActivationHandler = StartEycaActivationHandler(
      userEycaCardModelMock as any,
      userCgnModelMock as any,
      DEFAULT_EYCA_UPPER_BOUND_AGE
    );
    const response = await startEycaActivationHandler(
      // tslint:disable-next-line: no-console
      { log: { error: console.log } } as any,
      aFiscalCode
    );
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should start a new orchestrator if there aren' t conflict on the same id", async () => {
    await startHandler();
    expect(mockStartNew).toBeCalledTimes(1);
  });

  it("should return an Accepted response if there is another orchestrator running with the same id", async () => {
    checkUpdateCardIsRunningMock.mockImplementationOnce(() =>
      fromLeft(ResponseSuccessAccepted())
    );
    const response = await startHandler();
    expect(response.kind).toBe("IResponseSuccessAccepted");
  });

  it("should return an Response redirect to resource response if all steps succeed", async () => {
    const response = await startHandler();
    expect(response.kind).toBe("IResponseSuccessRedirectToResource");
  });
});
