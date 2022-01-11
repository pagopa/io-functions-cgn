/* eslint-disable @typescript-eslint/no-explicit-any */
import { toCosmosErrorResponse } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { none, some } from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { context } from "../../__mocks__/durable-functions";
import { cgnActivatedDates } from "../../__mocks__/mock";
import { StatusEnum as ActivatedStatusEnum } from "../../generated/definitions/CardActivated";
import {
  CardPending,
  StatusEnum
} from "../../generated/definitions/CardPending";

import { StatusEnum as ExpiredStatusEnum } from "../../generated/definitions/CardExpired";
import { EycaCardActivated } from "../../generated/definitions/EycaCardActivated";
import { CcdbNumber } from "../../generated/eyca-api/CcdbNumber";
import { UserEycaCard } from "../../models/user_eyca_card";
import { ActivityInput, getExpireEycaActivityHandler } from "../handler";

const aFiscalCode = "RODFDS82S10H501T" as FiscalCode;

const aUserEycaCardNumber = "X321-Y321-Z321-W321" as CcdbNumber;
const anActivatedEycaCard: EycaCardActivated = {
  ...cgnActivatedDates,
  card_number: aUserEycaCardNumber,
  status: ActivatedStatusEnum.ACTIVATED
};

const anActivatedUserEycaCard: UserEycaCard = {
  card: anActivatedEycaCard,
  fiscalCode: aFiscalCode
};

const aUserCardPending: CardPending = {
  status: StatusEnum.PENDING
};

const findLastVersionByModelIdMock = jest.fn();
const updateMock = jest.fn();

const userCgnModelMock = {
  findLastVersionByModelId: findLastVersionByModelIdMock,
  update: updateMock
};

const anActivityInput: ActivityInput = {
  fiscalCode: aFiscalCode
};
describe("ExpireEycaActivity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should return failure if an error occurs during User Eyca Card retrieve", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      TE.left(toCosmosErrorResponse(new Error("query error")))
    );
    const expireEycaActivityHandler = getExpireEycaActivityHandler(
      userCgnModelMock as any
    );
    const response = await expireEycaActivityHandler(context, anActivityInput);
    expect(response.kind).toBe("FAILURE");
    if (response.kind === "FAILURE") {
      expect(response.reason).toBe(
        "Cannot retrieve User EYCA Card for the provided fiscalCode"
      );
    }
  });

  it("should return failure if no User Eyca Card was found", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() => TE.of(none));
    const expireEycaActivityHandler = getExpireEycaActivityHandler(
      userCgnModelMock as any
    );
    const response = await expireEycaActivityHandler(context, anActivityInput);
    expect(response.kind).toBe("FAILURE");
    if (response.kind === "FAILURE") {
      expect(response.reason).toBe(
        "No User EYCA Card found for the provided fiscalCode"
      );
    }
  });

  it("should return failure if User Eyca Card is not Active", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      TE.of(some(aUserCardPending))
    );
    const expireEycaActivityHandler = getExpireEycaActivityHandler(
      userCgnModelMock as any
    );
    const response = await expireEycaActivityHandler(context, anActivityInput);
    expect(response.kind).toBe("FAILURE");
    if (response.kind === "FAILURE") {
      expect(response.reason).toBe(
        "Cannot expire an EYCA Card that is not ACTIVATED"
      );
    }
  });

  it("should return failure if userCgn' s update fails", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      TE.of(some(anActivatedUserEycaCard))
    );
    updateMock.mockImplementationOnce(() =>
      TE.left(new Error("Cannot update User EYCA Card"))
    );
    const expireEycaActivityHandler = getExpireEycaActivityHandler(
      userCgnModelMock as any
    );
    const response = await expireEycaActivityHandler(context, anActivityInput);
    expect(response.kind).toBe("FAILURE");
    if (response.kind === "FAILURE") {
      expect(response.reason).toBe("Cannot update User EYCA Card");
    }
  });

  it("should return success if userCgn' s update success", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      TE.of(some(anActivatedUserEycaCard))
    );
    updateMock.mockImplementationOnce(() =>
      TE.of({
        ...anActivatedUserEycaCard,
        card: { ...anActivatedEycaCard, status: ExpiredStatusEnum.EXPIRED }
      })
    );
    const expireEycaActivityHandler = getExpireEycaActivityHandler(
      userCgnModelMock as any
    );
    const response = await expireEycaActivityHandler(context, anActivityInput);
    expect(response.kind).toBe("SUCCESS");
  });
});
