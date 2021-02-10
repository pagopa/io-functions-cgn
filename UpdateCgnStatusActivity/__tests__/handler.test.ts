/* tslint:disable: no-any */
import { none, some } from "fp-ts/lib/Option";
import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import { toCosmosErrorResponse } from "io-functions-commons/dist/src/utils/cosmosdb_model";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import { context } from "../../__mocks__/durable-functions";
import { cgnActivatedDates } from "../../__mocks__/mock";
import {
  CardPendingStatus,
  StatusEnum
} from "../../generated/definitions/CardPendingStatus";
import {
  CardRevokedStatus,
  StatusEnum as RevokedStatusEnum
} from "../../generated/definitions/CardRevokedStatus";
import { UserCgn } from "../../models/user_cgn";
import { ActivityInput, getUpdateCgnStatusActivityHandler } from "../handler";

const now = new Date();
const aFiscalCode = "RODFDS82S10H501T" as FiscalCode;
const aRevocationRequest = {
  revocation_reason: "aMotivation" as NonEmptyString
};

const aUserCardRevokedStatus: CardRevokedStatus = {
  ...cgnActivatedDates,
  revocation_date: now,
  revocation_reason: aRevocationRequest.revocation_reason,
  status: RevokedStatusEnum.REVOKED
};

const aRevokedUserCgn: UserCgn = {
  fiscalCode: aFiscalCode,
  id: "ID" as NonEmptyString,
  status: aUserCardRevokedStatus
};

const aUserCardPendingStatus: CardPendingStatus = {
  status: StatusEnum.PENDING
};

const findLastVersionByModelIdMock = jest.fn();
const updateMock = jest.fn();

const userCgnModelMock = {
  findLastVersionByModelId: findLastVersionByModelIdMock,
  update: updateMock
};

const anActivityInput: ActivityInput = {
  cardStatus: aUserCardRevokedStatus,
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
      expect(response.revocation_reason).toBe(
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
      expect(response.revocation_reason).toBe(
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
      expect(response.revocation_reason).toBe("Cannot update userCgn");
    }
  });

  it("should return success if userCgn' s update success", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some({ ...aRevokedUserCgn, status: aUserCardPendingStatus }))
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
