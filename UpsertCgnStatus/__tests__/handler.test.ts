/* eslint-disable @typescript-eslint/no-explicit-any */
import { toCosmosErrorResponse } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import {
  ResponseErrorInternal,
  ResponseSuccessAccepted
} from "@pagopa/ts-commons/lib/responses";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
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
      TE.left(toCosmosErrorResponse(new Error("query error")))
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
    findLastVersionByModelIdMock.mockImplementationOnce(() => TE.of(O.none));
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
      TE.of(O.some({ ...aRevokedUserCgn, card: aUserCardPending }))
    );
    checkUpdateCardIsRunningMock.mockImplementationOnce(() =>
      TE.left(ResponseErrorInternal("Error"))
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
      TE.of(O.some({ ...aRevokedUserCgn, card: aUserCardPending }))
    );
    checkUpdateCardIsRunningMock.mockImplementationOnce(() =>
      TE.left(ResponseSuccessAccepted())
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
      TE.of(O.some({ ...aRevokedUserCgn, card: aUserCardPending }))
    );
    checkUpdateCardIsRunningMock.mockImplementationOnce(() => TE.of(false));
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
