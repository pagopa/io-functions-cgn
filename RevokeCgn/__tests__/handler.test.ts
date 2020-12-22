/* tslint:disable: no-any */
import { some } from "fp-ts/lib/Option";
import { none } from "fp-ts/lib/Option";
import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import { toCosmosErrorResponse } from "io-functions-commons/dist/src/utils/cosmosdb_model";
import {
  ResponseErrorInternal,
  ResponseSuccessAccepted
} from "italia-ts-commons/lib/responses";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import { mockStartNew } from "../../__mocks__/durable-functions";
import {
  CgnCanceledStatus,
  StatusEnum as CanceledStatusEnum
} from "../../generated/definitions/CgnCanceledStatus";
import {
  CgnPendingStatus,
  StatusEnum
} from "../../generated/definitions/CgnPendingStatus";
import { CgnRevokationRequest } from "../../generated/definitions/CgnRevokationRequest";
import {
  CgnRevokedStatus,
  StatusEnum as RevokedStatusEnum
} from "../../generated/definitions/CgnRevokedStatus";
import { UserCgn } from "../../models/user_cgn";
import { RevokeCgnHandler } from "../handler";
import * as orchUtils from "../orchestrators";

const now = new Date();
const aFiscalCode = "RODFDS82S10H501T" as FiscalCode;
const aRevokationRequest: CgnRevokationRequest = {
  motivation: "aMotivation"
};

const aUserCgnRevokedStatus: CgnRevokedStatus = {
  motivation: aRevokationRequest.motivation,
  revokation_date: now,
  status: RevokedStatusEnum.REVOKED
};

const aUserCgnCanceledStatus: CgnCanceledStatus = {
  status: CanceledStatusEnum.CANCELED
};

const aUserCgnPendingStatus: CgnPendingStatus = {
  status: StatusEnum.PENDING
};

const aRevokedUserCgn: UserCgn = {
  fiscalCode: aFiscalCode,
  status: aUserCgnRevokedStatus
};

const findLastVersionByModelIdMock = jest.fn();
const userCgnModelMock = {
  findLastVersionByModelId: findLastVersionByModelIdMock
};
describe("RevokeCgn", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should return an Internal Error if an error occurs during UserCgn retrieve", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      fromLeft(toCosmosErrorResponse(new Error("query error")))
    );
    const revokeCgnHandler = RevokeCgnHandler(userCgnModelMock as any);
    const response = await revokeCgnHandler(
      {} as any,
      aFiscalCode,
      aRevokationRequest
    );
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return Not Found if no UserCgn was found for the provided fiscal code", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(none)
    );
    const revokeCgnHandler = RevokeCgnHandler(userCgnModelMock as any);
    const response = await revokeCgnHandler(
      {} as any,
      aFiscalCode,
      aRevokationRequest
    );
    expect(response.kind).toBe("IResponseErrorNotFound");
  });

  it("should return a Conflict error if an other UserCgn was found in revoked status for the provided fiscal code", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some(aRevokedUserCgn))
    );
    const revokeCgnHandler = RevokeCgnHandler(userCgnModelMock as any);
    const response = await revokeCgnHandler(
      {} as any,
      aFiscalCode,
      aRevokationRequest
    );
    expect(response.kind).toBe("IResponseErrorConflict");
  });

  it("should return a Conflict error if an other UserCgn was found in canceled status for the provided fiscal code", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(
        some({ ...aRevokedUserCgn, status: aUserCgnCanceledStatus })
      )
    );
    const revokeCgnHandler = RevokeCgnHandler(userCgnModelMock as any);
    const response = await revokeCgnHandler(
      {} as any,
      aFiscalCode,
      aRevokationRequest
    );
    expect(response.kind).toBe("IResponseErrorConflict");
  });

  it("should return an Internal Error if it is not possible to check status of an other orchestrator with the same id", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some({ ...aRevokedUserCgn, status: aUserCgnPendingStatus }))
    );
    jest
      .spyOn(orchUtils, "checkRevokeCgnIsRunning")
      .mockImplementationOnce(() => fromLeft(ResponseErrorInternal("Error")));
    const revokeCgnHandler = RevokeCgnHandler(userCgnModelMock as any);
    const response = await revokeCgnHandler(
      {} as any,
      aFiscalCode,
      aRevokationRequest
    );
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return an Accepted response if there is another orchestrator running with the same id", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some({ ...aRevokedUserCgn, status: aUserCgnPendingStatus }))
    );
    jest
      .spyOn(orchUtils, "checkRevokeCgnIsRunning")
      .mockImplementationOnce(() => fromLeft(ResponseSuccessAccepted()));
    const revokeCgnHandler = RevokeCgnHandler(userCgnModelMock as any);
    const response = await revokeCgnHandler(
      {} as any,
      aFiscalCode,
      aRevokationRequest
    );
    expect(response.kind).toBe("IResponseSuccessAccepted");
  });

  it("should start a new orchestrator if there aren' t conflict on the same id", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some({ ...aRevokedUserCgn, status: aUserCgnPendingStatus }))
    );
    jest
      .spyOn(orchUtils, "checkRevokeCgnIsRunning")
      .mockImplementationOnce(() => taskEither.of(false));
    const revokeCgnHandler = RevokeCgnHandler(userCgnModelMock as any);
    await revokeCgnHandler({} as any, aFiscalCode, aRevokationRequest);
    expect(mockStartNew).toBeCalledTimes(1);
  });
});
