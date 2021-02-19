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
  getSuccessEycaActivationActivityHandler
} from "../handler";

const aFiscalCode = "RODFDS92S10H501T" as FiscalCode;

const findLastVersionByModelIdMock = jest
  .fn()
  .mockImplementation(() => taskEither.of(some({})));
const updateMock = jest.fn().mockImplementation(() => taskEither.of({}));

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
          text: aCcdbNumber
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

describe("UpdateCgnStatusActivity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return success if card activation succeded", async () => {
    const handler = getSuccessEycaActivationActivityHandler(
      eycaApiClient as any,
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
