/* tslint:disable: no-any */
import { none, some } from "fp-ts/lib/Option";
import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import { toCosmosErrorResponse } from "io-functions-commons/dist/src/utils/cosmosdb_model";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import { context } from "../../__mocks__/durable-functions";
import {
  CgnPendingStatus,
  StatusEnum
} from "../../generated/definitions/CgnPendingStatus";
import {
  CgnRevokedStatus,
  StatusEnum as RevokedStatusEnum
} from "../../generated/definitions/CgnRevokedStatus";
import { UserCgn } from "../../models/user_cgn";
import { ActivityInput, getUpdateCgnStatusActivityHandler } from "../handler";

const now = new Date();
const aFiscalCode = "RODFDS82S10H501T" as FiscalCode;
const aRevokationRequest = {
  motivation: "aMotivation" as NonEmptyString
};

const aUserCgnRevokedStatus: CgnRevokedStatus = {
  motivation: aRevokationRequest.motivation,
  revokation_date: now,
  status: RevokedStatusEnum.REVOKED
};

const aRevokedUserCgn: UserCgn = {
  fiscalCode: aFiscalCode,
  id: "ID" as NonEmptyString,
  status: aUserCgnRevokedStatus
};

const aUserCgnPendingStatus: CgnPendingStatus = {
  status: StatusEnum.PENDING
};

const findLastVersionByModelIdMock = jest.fn();
const updateMock = jest.fn();

const userCgnModelMock = {
  findLastVersionByModelId: findLastVersionByModelIdMock,
  update: updateMock
};

const anActivityInput: ActivityInput = {
  cgnStatus: aUserCgnRevokedStatus,
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
      fromLeft(new Error("cannot update userCgn"))
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
      taskEither.of(some({ ...aRevokedUserCgn, status: aUserCgnPendingStatus }))
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
