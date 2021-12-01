/* tslint:disable: no-any */
import { addYears } from "date-fns";
import { none, some } from "fp-ts/lib/Option";
import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import { toCosmosErrorResponse } from "io-functions-commons/dist/src/utils/cosmosdb_model";
import {
  ResponseErrorInternal,
  ResponseSuccessAccepted
} from "italia-ts-commons/lib/responses";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import { context, mockStartNew } from "../../__mocks__/durable-functions";
import { cgnActivatedDates } from "../../__mocks__/mock";
import { Card } from "../../generated/definitions/Card";
import {
  CardActivated,
  StatusEnum as ActivatedStatusEnum
} from "../../generated/definitions/CardActivated";
import {
  CardRevoked,
  StatusEnum as RevokedStatusEnum
} from "../../generated/definitions/CardRevoked";
import { EycaCardActivated } from "../../generated/definitions/EycaCardActivated";
import { EycaCardRevoked } from "../../generated/definitions/EycaCardRevoked";
import { CcdbNumber } from "../../generated/eyca-api/CcdbNumber";
import { UserCgn } from "../../models/user_cgn";
import { UserCgnModel } from "../../models/user_cgn";
import { UserEycaCardModel } from "../../models/user_eyca_card";
import * as orchUtils from "../../utils/orchestrators";
import { DeleteCardActivationHandler } from "../handler";

const now = new Date();
const aFiscalCode = "RODFDS89S10H501T" as FiscalCode;
const aUserEycaCardNumber = "X321-Y321-Z321-W321" as CcdbNumber;

const aRevocationRequest = {
  reason: "aMotivation" as NonEmptyString
};

const aUserCardRevoked: CardRevoked = {
  ...cgnActivatedDates,
  revocation_date: now,
  revocation_reason: "revocation_reason" as NonEmptyString,
  status: RevokedStatusEnum.REVOKED
};

const aUserCardActivated: CardActivated = {
  activation_date: new Date(),
  expiration_date: addYears(new Date(), 2),
  status: ActivatedStatusEnum.ACTIVATED
};

const aRevokedUserCgn: UserCgn = {
  card: aUserCardRevoked,
  fiscalCode: aFiscalCode,
  id: "A_USER_CGN_ID" as NonEmptyString
};

const anActivatedUserCgn: UserCgn = {
  card: aUserCardActivated,
  fiscalCode: aFiscalCode,
  id: "A_USER_CGN_ID" as NonEmptyString
};

const aUserEycaCardActivated: EycaCardActivated = {
  ...cgnActivatedDates,
  card_number: aUserEycaCardNumber,
  expiration_date: addYears(new Date(), 2),
  status: ActivatedStatusEnum.ACTIVATED
};

const aEycaUserCardRevoked: EycaCardRevoked = {
  ...cgnActivatedDates,
  card_number: aUserEycaCardNumber,
  revocation_date: now,
  revocation_reason: aRevocationRequest.reason,
  status: RevokedStatusEnum.REVOKED
};
const anArrayOfCardResults: ReadonlyArray<Card> = [aEycaUserCardRevoked];
const eycaFindAllMock = jest
  .fn()
  .mockImplementation(() => taskEither.of(anArrayOfCardResults));
const eycaDeleteVersionMock = jest
  .fn()
  .mockImplementation(() => taskEither.of("id"));
const eycaFindLastVersionByModelIdMock = jest.fn();

const userEycaModelMock = {
  deleteVersion: eycaDeleteVersionMock,
  findAll: eycaFindAllMock,
  findLastVersionByModelId: eycaFindLastVersionByModelIdMock
};

const cgnFindLastVersionByModelIdMock = jest
  .fn()
  .mockImplementation(() => taskEither.of(some(aUserCardRevoked)));
const cgnUpdateMock = jest.fn();
const cgnUpsertModelMock = jest.fn();

const userCgnModelMock = {
  findLastVersionByModelId: cgnFindLastVersionByModelIdMock,
  update: cgnUpdateMock,
  upsert: cgnUpsertModelMock
};

const checkUpdateCardIsRunningMock = jest.fn();
jest
  .spyOn(orchUtils, "checkUpdateCardIsRunning")
  .mockImplementation(checkUpdateCardIsRunningMock);

describe("DeleteCardActivationHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return an Internal Error if an error occurs during UserCgn retrieve", async () => {
    cgnFindLastVersionByModelIdMock.mockImplementationOnce(() =>
      fromLeft(toCosmosErrorResponse(new Error("query error")))
    );
    const deleteCardActivationHandler = DeleteCardActivationHandler(
      (userEycaModelMock as unknown) as UserEycaCardModel,
      (userCgnModelMock as unknown) as UserCgnModel
    );
    const response = await deleteCardActivationHandler(context, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return an NotAuthorized Error if the user CGN is revoked", async () => {
    cgnFindLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some(aRevokedUserCgn))
    );

    const deleteCardActivationHandler = DeleteCardActivationHandler(
      (userEycaModelMock as unknown) as UserEycaCardModel,
      (userCgnModelMock as unknown) as UserCgnModel
    );
    const response = await deleteCardActivationHandler(context, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });

  it("should return an Internal Error if an error occurs during Eyca Card retrieve", async () => {
    cgnFindLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some(anActivatedUserCgn))
    );
    eycaFindLastVersionByModelIdMock.mockImplementationOnce(() =>
      fromLeft(toCosmosErrorResponse(new Error("query error")))
    );
    const deleteCardActivationHandler = DeleteCardActivationHandler(
      (userEycaModelMock as unknown) as UserEycaCardModel,
      (userCgnModelMock as unknown) as UserCgnModel
    );
    const response = await deleteCardActivationHandler(context, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return an conflict error if there is an active cgn card and a revoked eyca card", async () => {
    cgnFindLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some(anActivatedUserCgn))
    );
    eycaFindLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some(aEycaUserCardRevoked))
    );
    const deleteCardActivationHandler = DeleteCardActivationHandler(
      (userEycaModelMock as unknown) as UserEycaCardModel,
      (userCgnModelMock as unknown) as UserCgnModel
    );
    const response = await deleteCardActivationHandler(context, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorConflict");
  });

  it("should return an Internal Error if it is not possible to check status of an other orchestrator with the same id", async () => {
    cgnFindLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some(anActivatedUserCgn))
    );
    eycaFindLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(none)
    );
    checkUpdateCardIsRunningMock.mockImplementationOnce(() =>
      fromLeft(ResponseErrorInternal("Error"))
    );
    const deleteCardActivationHandler = DeleteCardActivationHandler(
      (userEycaModelMock as unknown) as UserEycaCardModel,
      (userCgnModelMock as unknown) as UserCgnModel
    );
    const response = await deleteCardActivationHandler(context, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return an Accepted response if there is another orchestrator running with the same id", async () => {
    cgnFindLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some(anActivatedUserCgn))
    );
    eycaFindLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some(aUserEycaCardActivated))
    );
    checkUpdateCardIsRunningMock.mockImplementationOnce(() =>
      fromLeft(ResponseSuccessAccepted())
    );
    const deleteCardActivationHandler = DeleteCardActivationHandler(
      (userEycaModelMock as unknown) as UserEycaCardModel,
      (userCgnModelMock as unknown) as UserCgnModel
    );
    const response = await deleteCardActivationHandler(context, aFiscalCode);
    expect(response.kind).toBe("IResponseSuccessAccepted");
  });

  it("should start a new orchestrator if there aren' t conflict on the same id", async () => {
    cgnFindLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some(anActivatedUserCgn))
    );
    eycaFindLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some(aUserEycaCardActivated))
    );
    checkUpdateCardIsRunningMock.mockImplementationOnce(() =>
      taskEither.of(false)
    );
    cgnUpsertModelMock.mockImplementationOnce(() => taskEither.of({}));
    const deleteCardActivationHandler = DeleteCardActivationHandler(
      (userEycaModelMock as unknown) as UserEycaCardModel,
      (userCgnModelMock as unknown) as UserCgnModel
    );
    await deleteCardActivationHandler(context, aFiscalCode);
    expect(mockStartNew).toBeCalledTimes(1);
  });

  it("should start an Internal Error if there are errors while inserting a new Cgn in pending delete status", async () => {
    checkUpdateCardIsRunningMock.mockImplementationOnce(() =>
      taskEither.of(false)
    );
    cgnFindLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some(anActivatedUserCgn))
    );
    eycaFindLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some(aUserEycaCardActivated))
    );
    cgnUpsertModelMock.mockImplementationOnce(() =>
      fromLeft(new Error("Insert error"))
    );
    const deleteCardActivationHandler = DeleteCardActivationHandler(
      (userEycaModelMock as unknown) as UserEycaCardModel,
      (userCgnModelMock as unknown) as UserCgnModel
    );
    const response = await deleteCardActivationHandler(context, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorInternal");
    expect(mockStartNew).not.toHaveBeenCalled();
  });
});
