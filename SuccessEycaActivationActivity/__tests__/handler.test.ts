/* eslint-disable @typescript-eslint/no-explicit-any */
import { toCosmosErrorResponse } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as date_fns from "date-fns";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { context } from "../../__mocks__/durable-functions";
import { now, testFail } from "../../__mocks__/mock";
import { StatusEnum as ActivatedStatusEnum } from "../../generated/definitions/CardActivated";
import {
  CardPending,
  StatusEnum as PendingStatusEnum
} from "../../generated/definitions/CardPending";
import { EycaCardActivated } from "../../generated/definitions/EycaCardActivated";
import { CcdbNumber } from "../../generated/eyca-api/CcdbNumber";
import { UserEycaCard } from "../../models/user_eyca_card";
import * as eyca from "../../utils/eyca";
import {
  ActivityInput,
  getSuccessEycaActivationActivityHandler
} from "../handler";
import { toError } from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";

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
  .mockImplementation(() => TE.of(O.some(aPendingUserEycaCard)));

const updateMock = jest.fn().mockImplementation(() => {
  return TE.of(anActivatedUserEycaCard);
});

const userEycaCardModelMock = {
  findLastVersionByModelId: findLastVersionByModelIdMock,
  update: updateMock
};

const aCcdbNumber = "X123-Y123-Z123-W123" as CcdbNumber;
const preIssueCardMock = jest.fn().mockImplementation(() => TE.of(aCcdbNumber));
const updateCardMock = jest
  .fn()
  .mockImplementation(() => TE.of("Object(s) updated." as NonEmptyString));

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

  it("should throw if an error occurs during UserEycaCard retrieve", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      TE.left(toCosmosErrorResponse(new Error("query error")))
    );
    const handler = getSuccessEycaActivationActivityHandler(
      {} as any,
      {} as any,
      anEycaApiUsername,
      anEycaApiPassword,
      userEycaCardModelMock as any
    );
    await pipe(
      TE.tryCatch(() => handler(context, anActivityInput), toError),
      TE.bimap(e => {
        expect(e).toBeDefined();
        expect(e.message).toEqual(
          "TRANSIENT FAILURE|ERROR=Cannot retrieve EYCA card for the provided fiscalCode"
        );
      }, testFail)
    )();
  });

  it("should return failure if no UserEycaCard was found", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() => TE.of(O.none));
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
        "PERMANENT FAILURE|ERROR=No EYCA card found for the provided fiscalCode"
      );
    }
  });

  it("should throw if EYCA card code retrieve fails", async () => {
    preIssueCardMock.mockImplementationOnce(() =>
      TE.left({ kind: "TRANSIENT", reason: "Error on PreIssueCard" })
    );
    const handler = getSuccessEycaActivationActivityHandler(
      {} as any,
      {} as any,
      anEycaApiUsername,
      anEycaApiPassword,
      userEycaCardModelMock as any
    );
    await pipe(
      TE.tryCatch(() => handler(context, anActivityInput), toError),
      TE.bimap(e => {
        expect(e).toBeDefined();
        expect(e.message).toEqual("Error on PreIssueCard");
      }, testFail)
    )();
  });

  it("should throw if EYCA card update API fails", async () => {
    updateCardMock.mockImplementationOnce(() =>
      TE.left({ kind: "TRANSIENT", reason: "Error on UpdateCard" })
    );
    const handler = getSuccessEycaActivationActivityHandler(
      {} as any,
      {} as any,
      anEycaApiUsername,
      anEycaApiPassword,
      userEycaCardModelMock as any
    );
    await pipe(
      TE.tryCatch(() => handler(context, anActivityInput), toError),
      TE.bimap(e => {
        expect(e).toBeDefined();
        expect(e.message).toEqual("Error on UpdateCard");
      }, testFail)
    )();
  });

  it("should throw if EYCA card update fails", async () => {
    updateMock.mockImplementationOnce(() => TE.left("Cannot update EYCA Card"));
    const handler = getSuccessEycaActivationActivityHandler(
      {} as any,
      {} as any,
      anEycaApiUsername,
      anEycaApiPassword,
      userEycaCardModelMock as any
    );
    await pipe(
      TE.tryCatch(() => handler(context, anActivityInput), toError),
      TE.bimap(e => {
        expect(e).toBeDefined();
        expect(e.message).toContain("TRANSIENT FAILURE");
      }, testFail)
    )();
  });
});
