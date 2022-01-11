/* eslint-disable @typescript-eslint/no-explicit-any */
import { toCosmosErrorResponse } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { context } from "../../__mocks__/durable-functions";
import { cgnActivatedDates } from "../../__mocks__/mock";
import {
  CardPending,
  StatusEnum
} from "../../generated/definitions/CardPending";
import {
  CardRevoked,
  StatusEnum as RevokedStatusEnum
} from "../../generated/definitions/CardRevoked";
import { UserCgn } from "../../models/user_cgn";
import { ActivityInput, getUpdateCgnStatusActivityHandler } from "../handler";

const now = new Date();
const aFiscalCode = "RODFDS82S10H501T" as FiscalCode;
const aRevocationRequest = {
  reason: "aMotivation" as NonEmptyString
};

const aUserCardRevoked: CardRevoked = {
  ...cgnActivatedDates,
  revocation_date: now,
  revocation_reason: aRevocationRequest.reason,
  status: RevokedStatusEnum.REVOKED
};

const aRevokedUserCgn: UserCgn = {
  card: aUserCardRevoked,
  fiscalCode: aFiscalCode,
  id: "ID" as NonEmptyString
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
  card: aUserCardRevoked,
  fiscalCode: aFiscalCode
};
describe("UpdateCgnStatusActivity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should return failure if an error occurs during UserCgn retrieve", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      TE.left(toCosmosErrorResponse(new Error("query error")))
    );
    const updateCgnStatusActivityHandler = getUpdateCgnStatusActivityHandler(
      userCgnModelMock as any
    );
    const response = await updateCgnStatusActivityHandler(
      context,
      anActivityInput
    );
    expect(response.kind).toBe("FAILURE");
    if (response.kind === "FAILURE") {
      expect(response.reason).toBe(
        "Cannot retrieve userCgn for the provided fiscalCode"
      );
    }
  });

  it("should return failure if no UserCgn was found", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() => TE.of(O.none));
    const updateCgnStatusActivityHandler = getUpdateCgnStatusActivityHandler(
      userCgnModelMock as any
    );
    const response = await updateCgnStatusActivityHandler(
      context,
      anActivityInput
    );
    expect(response.kind).toBe("FAILURE");
    if (response.kind === "FAILURE") {
      expect(response.reason).toBe(
        "No userCgn found for the provided fiscalCode"
      );
    }
  });
  it("should return failure if userCgn' s update fails", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      TE.of(O.some(aRevokedUserCgn))
    );
    updateMock.mockImplementationOnce(() =>
      TE.left(new Error("Cannot update userCgn"))
    );
    const updateCgnStatusActivityHandler = getUpdateCgnStatusActivityHandler(
      userCgnModelMock as any
    );
    const response = await updateCgnStatusActivityHandler(
      context,
      anActivityInput
    );
    expect(response.kind).toBe("FAILURE");
    if (response.kind === "FAILURE") {
      expect(response.reason).toBe("Cannot update userCgn");
    }
  });

  it("should return success if userCgn' s update success", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      TE.of(O.some({ ...aRevokedUserCgn, card: aUserCardPending }))
    );
    updateMock.mockImplementationOnce(() => TE.of(aRevokedUserCgn));
    const updateCgnStatusActivityHandler = getUpdateCgnStatusActivityHandler(
      userCgnModelMock as any
    );
    const response = await updateCgnStatusActivityHandler(
      context,
      anActivityInput
    );
    expect(response.kind).toBe("SUCCESS");
  });
});
