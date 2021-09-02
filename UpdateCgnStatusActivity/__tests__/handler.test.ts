/* tslint:disable: no-any */
import { none, some } from "fp-ts/lib/Option";
import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import { toCosmosErrorResponse } from "io-functions-commons/dist/src/utils/cosmosdb_model";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
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
      fromLeft(toCosmosErrorResponse(new Error("query error")))
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
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(none)
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
        "No userCgn found for the provided fiscalCode"
      );
    }
  });
  it("should return failure if userCgn' s update fails", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some(aRevokedUserCgn))
    );
    updateMock.mockImplementationOnce(() =>
      fromLeft(new Error("Cannot update userCgn"))
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
      taskEither.of(some({ ...aRevokedUserCgn, card: aUserCardPending }))
    );
    updateMock.mockImplementationOnce(() => taskEither.of(aRevokedUserCgn));
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
