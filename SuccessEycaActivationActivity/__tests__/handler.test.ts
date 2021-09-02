/* tslint:disable: no-any */
import * as date_fns from "date-fns";
import { none, some } from "fp-ts/lib/Option";
import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import { toCosmosErrorResponse } from "io-functions-commons/dist/src/utils/cosmosdb_model";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { context } from "../../__mocks__/durable-functions";
import { now } from "../../__mocks__/mock";
import { StatusEnum as ActivatedStatusEnum } from "../../generated/definitions/CardActivated";
import {
  CardPending,
  StatusEnum as PendingStatusEnum
} from "../../generated/definitions/CardPending";
import { EycaCardActivated } from "../../generated/definitions/EycaCardActivated";
import { CcdbNumber } from "../../generated/eyca-api/CcdbNumber";
import { UserEycaCard } from "../../models/user_eyca_card";
import * as eyca from "../eyca";
import {
  ActivityInput,
  getSuccessEycaActivationActivityHandler
} from "../handler";

const aFiscalCode = "RODFDS92S10H501T" as FiscalCode;
const aUserEycaCardNumber = "X321-Y321-Z321-W321" as CcdbNumber;
const expirationDate = date_fns.addYears(now, 5);

const aPendingEycaCard: CardPending = {
  status: PendingStatusEnum.PENDING
};

const aPendingUserEycaCard: UserEycaCard = {
  card: aPendingEycaCard,
  fiscalCode: aFiscalCode
};

const anActivatedEycaCard: EycaCardActivated = {
  activation_date: now,
  card_number: aUserEycaCardNumber,
  expiration_date: expirationDate,
  status: ActivatedStatusEnum.ACTIVATED
};

const anActivatedUserEycaCard: UserEycaCard = {
  card: anActivatedEycaCard,
  fiscalCode: aFiscalCode
};

const findLastVersionByModelIdMock = jest
  .fn()
  .mockImplementation(() => taskEither.of(some(aPendingUserEycaCard)));

const updateMock = jest.fn().mockImplementation(() => {
  return taskEither.of(anActivatedUserEycaCard);
});

const userEycaCardModelMock = {
  findLastVersionByModelId: findLastVersionByModelIdMock,
  update: updateMock
};

const aCcdbNumber = "X123-Y123-Z123-W123" as CcdbNumber;
const preIssueCardMock = jest
  .fn()
  .mockImplementation(() => taskEither.of(aCcdbNumber));
const updateCardMock = jest
  .fn()
  .mockImplementation(() =>
    taskEither.of("Object(s) updated." as NonEmptyString)
  );

jest.spyOn(eyca, "updateCard").mockImplementation(updateCardMock);
jest.spyOn(eyca, "preIssueCard").mockImplementation(preIssueCardMock);
const anEycaApiUsername = "USERNAME" as NonEmptyString;
const anEycaApiPassword = "PASSWORD" as NonEmptyString;
const anActivityInput: ActivityInput = {
  activationDate: new Date(),
  expirationDate,
  fiscalCode: aFiscalCode
};

describe("SuccessEycaActivationActivity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return success if card activation succeded", async () => {
    const handler = getSuccessEycaActivationActivityHandler(
      {} as any,
      {} as any,
      anEycaApiUsername,
      anEycaApiPassword,
      userEycaCardModelMock as any
    );
    const response = await handler(context, anActivityInput);
    expect(response.kind).toBe("SUCCESS");
  });

  it("should return failure if an error occurs during UserEycaCard retrieve", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      fromLeft(toCosmosErrorResponse(new Error("query error")))
    );
    const handler = getSuccessEycaActivationActivityHandler(
      {} as any,
      {} as any,
      anEycaApiUsername,
      anEycaApiPassword,
      userEycaCardModelMock as any
    );
    const response = await handler(context, anActivityInput);
    expect(response.kind).toBe("FAILURE");
    if (response.kind === "FAILURE") {
      expect(response.reason).toBe(
        "Cannot retrieve EYCA card for the provided fiscalCode"
      );
    }
  });

  it("should return failure if no UserEycaCard was found", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(none)
    );
    const handler = getSuccessEycaActivationActivityHandler(
      {} as any,
      {} as any,
      anEycaApiUsername,
      anEycaApiPassword,
      userEycaCardModelMock as any
    );
    const response = await handler(context, anActivityInput);
    expect(response.kind).toBe("FAILURE");
    if (response.kind === "FAILURE") {
      expect(response.reason).toBe(
        "No EYCA card found for the provided fiscalCode"
      );
    }
  });

  it("should return failure if EYCA card code retrieve fails", async () => {
    preIssueCardMock.mockImplementationOnce(() =>
      fromLeft("Error on PreIssueCard")
    );
    const handler = getSuccessEycaActivationActivityHandler(
      {} as any,
      {} as any,
      anEycaApiUsername,
      anEycaApiPassword,
      userEycaCardModelMock as any
    );
    const response = await handler(context, anActivityInput);
    expect(response.kind).toBe("FAILURE");
  });

  it("should return failure if EYCA card update API fails", async () => {
    updateCardMock.mockImplementationOnce(() =>
      fromLeft("Error on UpdateCard")
    );
    const handler = getSuccessEycaActivationActivityHandler(
      {} as any,
      {} as any,
      anEycaApiUsername,
      anEycaApiPassword,
      userEycaCardModelMock as any
    );
    const response = await handler(context, anActivityInput);
    expect(response.kind).toBe("FAILURE");
  });

  it("should return failure if EYCA card update fails", async () => {
    updateMock.mockImplementationOnce(() =>
      fromLeft("Cannot update EYCA card")
    );
    const handler = getSuccessEycaActivationActivityHandler(
      {} as any,
      {} as any,
      anEycaApiUsername,
      anEycaApiPassword,
      userEycaCardModelMock as any
    );
    const response = await handler(context, anActivityInput);
    expect(response.kind).toBe("FAILURE");
  });
});
