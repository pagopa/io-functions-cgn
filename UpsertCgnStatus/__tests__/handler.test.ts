/* tslint:disable: no-any */
import { some } from "fp-ts/lib/Option";
import { none } from "fp-ts/lib/Option";
import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import { toCosmosErrorResponse } from "io-functions-commons/dist/src/utils/cosmosdb_model";
import {
  ResponseErrorInternal,
  ResponseSuccessAccepted
} from "italia-ts-commons/lib/responses";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import { mockStartNew } from "../../__mocks__/durable-functions";
import { cgnActivatedDates } from "../../__mocks__/mock";
import {
  CardPending,
  StatusEnum
} from "../../generated/definitions/CardPending";
import {
  CardRevoked,
  StatusEnum as RevokedStatusEnum
} from "../../generated/definitions/CardRevoked";
import {
  ActionEnum,
  CgnStatusUpsertRequest
} from "../../generated/definitions/CgnStatusUpsertRequest";
import { UserCgn } from "../../models/user_cgn";
import * as orchUtils from "../../utils/orchestrators";
import { UpsertCgnStatusHandler } from "../handler";

const now = new Date();
const aFiscalCode = "RODFDS82S10H501T" as FiscalCode;
const aCgnUpsertStatusRequest: CgnStatusUpsertRequest = {
  action: ActionEnum.REVOKE,
  revocation_reason: "aMotivation" as NonEmptyString
};

const aUserCardRevoked: CardRevoked = {
  ...cgnActivatedDates,
  revocation_date: now,
  revocation_reason: aCgnUpsertStatusRequest.revocation_reason,
  status: RevokedStatusEnum.REVOKED
};

const aUserCardPending: CardPending = {
  status: StatusEnum.PENDING
};

const aRevokedUserCgn: UserCgn = {
  card: aUserCardRevoked,
  fiscalCode: aFiscalCode,
  id: "A_USER_CGN_ID" as NonEmptyString
};

const findLastVersionByModelIdMock = jest.fn();
const userCgnModelMock = {
  findLastVersionByModelId: findLastVersionByModelIdMock
};

const checkUpdateCardIsRunningMock = jest.fn();
jest
  .spyOn(orchUtils, "checkUpdateCardIsRunning")
  .mockImplementation(checkUpdateCardIsRunningMock);
describe("UpsertCgnStatus", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return an Internal Error if an error occurs during UserCgn retrieve", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      fromLeft(toCosmosErrorResponse(new Error("query error")))
    );
    const upsertCgnStatusHandler = UpsertCgnStatusHandler(
      userCgnModelMock as any
    );
    const response = await upsertCgnStatusHandler(
      {} as any,
      aFiscalCode,
      aCgnUpsertStatusRequest
    );
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return Not Found if no UserCgn was found for the provided fiscal code", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(none)
    );
    const upsertCgnStatusHandler = UpsertCgnStatusHandler(
      userCgnModelMock as any
    );
    const response = await upsertCgnStatusHandler(
      {} as any,
      aFiscalCode,
      aCgnUpsertStatusRequest
    );
    expect(response.kind).toBe("IResponseErrorNotFound");
  });

  it("should return an Internal Error if it is not possible to check status of an other orchestrator with the same id", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some({ ...aRevokedUserCgn, card: aUserCardPending }))
    );
    checkUpdateCardIsRunningMock.mockImplementationOnce(() =>
      fromLeft(ResponseErrorInternal("Error"))
    );
    const upsertCgnStatusHandler = UpsertCgnStatusHandler(
      userCgnModelMock as any
    );
    const response = await upsertCgnStatusHandler(
      {} as any,
      aFiscalCode,
      aCgnUpsertStatusRequest
    );
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return an Accepted response if there is another orchestrator running with the same id", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some({ ...aRevokedUserCgn, card: aUserCardPending }))
    );
    checkUpdateCardIsRunningMock.mockImplementationOnce(() =>
      fromLeft(ResponseSuccessAccepted())
    );
    const upsertCgnStatusHandler = UpsertCgnStatusHandler(
      userCgnModelMock as any
    );
    const response = await upsertCgnStatusHandler(
      {} as any,
      aFiscalCode,
      aCgnUpsertStatusRequest
    );
    expect(response.kind).toBe("IResponseSuccessAccepted");
  });

  it("should start a new orchestrator if there aren' t conflict on the same id", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some({ ...aRevokedUserCgn, card: aUserCardPending }))
    );
    checkUpdateCardIsRunningMock.mockImplementationOnce(() =>
      taskEither.of(false)
    );
    const upsertCgnStatusHandler = UpsertCgnStatusHandler(
      userCgnModelMock as any
    );
    await upsertCgnStatusHandler(
      {} as any,
      aFiscalCode,
      aCgnUpsertStatusRequest
    );
    expect(mockStartNew).toBeCalledTimes(1);
  });
});
