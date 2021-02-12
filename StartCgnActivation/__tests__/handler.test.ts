/* tslint:disable: no-any */
import { addYears } from "date-fns";
import { some } from "fp-ts/lib/Option";
import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import { toCosmosErrorResponse } from "io-functions-commons/dist/src/utils/cosmosdb_model";
import {
  ResponseErrorInternal,
  ResponseSuccessAccepted
} from "italia-ts-commons/lib/responses";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import {
  mockGetStatus,
  mockStartNew,
  mockStatusRunning
} from "../../__mocks__/durable-functions";
import { cgnActivatedDates } from "../../__mocks__/mock";
import {
  CgnActivatedStatus,
  StatusEnum as ActivatedStatusEnum
} from "../../generated/definitions/CgnActivatedStatus";
import {
  CgnPendingStatus,
  StatusEnum
} from "../../generated/definitions/CgnPendingStatus";
import {
  CgnRevokedStatus,
  StatusEnum as RevokedStatusEnum
} from "../../generated/definitions/CgnRevokedStatus";
import { UserCgn } from "../../models/user_cgn";
import * as orchUtils from "../../utils/orchestrators";
import { StartCgnActivationHandler } from "../handler";

const now = new Date();
const aFiscalCode = "RODFDS89S10H501T" as FiscalCode;
const anOldFiscalCode = "RODFDS82S10H501T" as FiscalCode;

const aUserCgnRevokedStatus: CgnRevokedStatus = {
  ...cgnActivatedDates,
  revocation_date: now,
  revocation_reason: "revocation_reason" as NonEmptyString,
  status: RevokedStatusEnum.REVOKED
};

const aUserCgnActivatedStatus: CgnActivatedStatus = {
  activation_date: new Date(),
  expiration_date: addYears(new Date(), 2),
  status: ActivatedStatusEnum.ACTIVATED
};

const aUserCgnPendingStatus: CgnPendingStatus = {
  status: StatusEnum.PENDING
};

const aRevokedUserCgn: UserCgn = {
  fiscalCode: aFiscalCode,
  id: "A_USER_CGN_ID" as NonEmptyString,
  status: aUserCgnRevokedStatus
};

const anActivatedUserCgn: UserCgn = {
  fiscalCode: aFiscalCode,
  id: "A_USER_CGN_ID" as NonEmptyString,
  status: aUserCgnActivatedStatus
};

const findLastVersionByModelIdMock = jest.fn();
const upsertModelMock = jest.fn();
const userCgnModelMock = {
  findLastVersionByModelId: findLastVersionByModelIdMock,
  upsert: upsertModelMock
};

const checkUpdateCgnIsRunningMock = jest.fn();
jest
  .spyOn(orchUtils, "checkUpdateCgnIsRunning")
  .mockImplementation(checkUpdateCgnIsRunningMock);
describe("StartCgnActivation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return an Internal Error if an error occurs during UserCgn retrieve", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      fromLeft(toCosmosErrorResponse(new Error("query error")))
    );
    const startCgnActivationHandler = StartCgnActivationHandler(
      userCgnModelMock as any
    );
    const response = await startCgnActivationHandler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return an Internal Error if it is not possible to check status of an other orchestrator with the same id", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some({ ...aRevokedUserCgn, status: aUserCgnPendingStatus }))
    );
    checkUpdateCgnIsRunningMock.mockImplementationOnce(() =>
      fromLeft(ResponseErrorInternal("Error"))
    );
    const startCgnActivationHandler = StartCgnActivationHandler(
      userCgnModelMock as any
    );
    const response = await startCgnActivationHandler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return an Accepted response if there is another orchestrator running with the same id", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some({ ...aRevokedUserCgn, status: aUserCgnPendingStatus }))
    );
    checkUpdateCgnIsRunningMock.mockImplementationOnce(() =>
      fromLeft(ResponseSuccessAccepted())
    );
    const startCgnActivationHandler = StartCgnActivationHandler(
      userCgnModelMock as any
    );
    const response = await startCgnActivationHandler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseSuccessAccepted");
  });

  it("should start a new orchestrator if there aren' t conflict on the same id", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some({ ...aRevokedUserCgn, status: aUserCgnPendingStatus }))
    );
    checkUpdateCgnIsRunningMock.mockImplementationOnce(() =>
      taskEither.of(false)
    );
    upsertModelMock.mockImplementationOnce(() => taskEither.of({}));
    const startCgnActivationHandler = StartCgnActivationHandler(
      userCgnModelMock as any
    );
    await startCgnActivationHandler({} as any, aFiscalCode);
    expect(mockStartNew).toBeCalledTimes(1);
  });

  it("should return a Conflict Error if a CGN is already ACTIVATED", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some(anActivatedUserCgn))
    );
    const startCgnActivationHandler = StartCgnActivationHandler(
      userCgnModelMock as any
    );
    const response = await startCgnActivationHandler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorConflict");
  });

  it("should start an Internal Error if there are errors while inserting a new Cgn in pending status", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some({ ...aRevokedUserCgn, status: aUserCgnPendingStatus }))
    );
    checkUpdateCgnIsRunningMock.mockImplementationOnce(() =>
      taskEither.of(false)
    );
    upsertModelMock.mockImplementationOnce(() =>
      fromLeft(new Error("Insert error"))
    );
    const startCgnActivationHandler = StartCgnActivationHandler(
      userCgnModelMock as any
    );
    const response = await startCgnActivationHandler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorInternal");
    expect(mockStartNew).not.toHaveBeenCalled();
  });

  it("should return a Forbidden Error if a fiscal code is not eligible for CGN", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      fromLeft(toCosmosErrorResponse(new Error("query error")))
    );
    const startCgnActivationHandler = StartCgnActivationHandler(
      userCgnModelMock as any
    );
    const response = await startCgnActivationHandler(
      {} as any,
      anOldFiscalCode
    );
    expect(response.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });
});
