/* tslint:disable: no-any */
import { addYears } from "date-fns";
import { left, right } from "fp-ts/lib/Either";
import { none, some } from "fp-ts/lib/Option";
import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import { toCosmosErrorResponse } from "io-functions-commons/dist/src/utils/cosmosdb_model";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import { context } from "../../__mocks__/durable-functions";
import { CcdbNumber } from "../../generated/eyca-api/CcdbNumber";
import * as cgn_checks from "../../utils/cgn_checks";
import {
  ActivityInput,
  ActivityResultSuccessWithValue,
  getSuccessEycaActivationActivityHandler
} from "../handler";
import {
  CardPending,
  StatusEnum as PendingStatusEnum
} from "../../generated/definitions/CardPending";
import { StatusEnum as ActivatedStatusEnum } from "../../generated/definitions/CardActivated";
import { UserEycaCard } from "../../models/user_eyca_card";
import { EycaCardActivated } from "../../generated/definitions/EycaCardActivated";
import { now } from "../../__mocks__/mock";
import { extractEycaExpirationDate } from "../../utils/cgn_checks";
import { identity } from "fp-ts/lib/function";
import { DateFromString } from "italia-ts-commons/lib/dates";

const aFiscalCode = "RODFDS92S10H501T" as FiscalCode;
const aUserEycaCardNumber = "X321-Y321-Z321-W321" as CcdbNumber;

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
  expiration_date: extractEycaExpirationDate(aFiscalCode).value as Date,
  status: ActivatedStatusEnum.ACTIVATED
};

const anActivatedUserEycaCard: UserEycaCard = {
  card: anActivatedEycaCard,
  fiscalCode: aFiscalCode
};

const findLastVersionByModelIdMock = jest
  .fn()
  .mockImplementation(() => taskEither.of(some(aPendingUserEycaCard)));

const updateMock = jest.fn().mockImplementation(v => {
  return taskEither.of(anActivatedUserEycaCard);
});

const userEycaCardModelMock = {
  findLastVersionByModelId: findLastVersionByModelIdMock,
  update: updateMock
};

const aCcdbNumber = "X123-Y123-Z123-W123" as CcdbNumber;
const preIssueCardMock = jest.fn().mockImplementation(() =>
  Promise.resolve(
    right({
      status: 200,
      value: {
        api_response: {
          data: {
            card: [{ ccdb_number: aCcdbNumber }]
          }
        }
      }
    })
  )
);
const updateCardMock = jest.fn().mockImplementation(() =>
  Promise.resolve(
    right({
      status: 200,
      value: {
        api_response: {
          text: "Object(s) updated."
        }
      }
    })
  )
);
const eycaApiClient = {
  preIssueCard: preIssueCardMock,
  updateCard: updateCardMock
};

const anEycaApiUsername = "USERNAME" as NonEmptyString;
const anEycaApiPassword = "PASSWORD" as NonEmptyString;
const anActivityInput: ActivityInput = {
  fiscalCode: aFiscalCode
};
const extractEycaExpirationDateMock = jest
  .spyOn(cgn_checks, "extractEycaExpirationDate")
  .mockImplementation(() => right(addYears(new Date(), 5)));

describe("SuccessEycaActivationActivity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return success with updated value if card activation succeded", async () => {
    const handler = getSuccessEycaActivationActivityHandler(
      eycaApiClient as any,
      anEycaApiUsername,
      anEycaApiPassword,
      userEycaCardModelMock as any
    );
    const response = await handler(context, anActivityInput);
    expect(response.kind).toBe("SUCCESS");

    const val = ActivityResultSuccessWithValue.decode(response)
      .map(res => res.value)
      .fold<EycaCardActivated | undefined>(_ => undefined, identity);

    expect(val).toMatchObject(anActivatedEycaCard);
  });

  it("should return failure if an error occurs during UserEycaCard retrieve", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      fromLeft(toCosmosErrorResponse(new Error("query error")))
    );
    const handler = getSuccessEycaActivationActivityHandler(
      eycaApiClient as any,
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
      eycaApiClient as any,
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
  it("should return failure if expiration date extraction fails", async () => {
    extractEycaExpirationDateMock.mockImplementationOnce(() =>
      left(new Error("Cannot extract date"))
    );
    const handler = getSuccessEycaActivationActivityHandler(
      eycaApiClient as any,
      anEycaApiUsername,
      anEycaApiPassword,
      userEycaCardModelMock as any
    );
    const response = await handler(context, anActivityInput);
    expect(response.kind).toBe("FAILURE");
  });

  it("should return failure if EYCA card code retrieve fails", async () => {
    preIssueCardMock.mockImplementationOnce(() =>
      Promise.resolve(
        right({
          status: 500,
          value: {
            api_response: {
              error: 1
            }
          }
        })
      )
    );
    const handler = getSuccessEycaActivationActivityHandler(
      eycaApiClient as any,
      anEycaApiUsername,
      anEycaApiPassword,
      userEycaCardModelMock as any
    );
    const response = await handler(context, anActivityInput);
    expect(response.kind).toBe("FAILURE");
  });

  it("should return failure if EYCA card update API fails", async () => {
    updateCardMock.mockImplementationOnce(() =>
      Promise.resolve(
        right({
          status: 500,
          value: {
            api_response: {
              error: 1
            }
          }
        })
      )
    );
    const handler = getSuccessEycaActivationActivityHandler(
      eycaApiClient as any,
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
      eycaApiClient as any,
      anEycaApiUsername,
      anEycaApiPassword,
      userEycaCardModelMock as any
    );
    const response = await handler(context, anActivityInput);
    expect(response.kind).toBe("FAILURE");
  });
});
