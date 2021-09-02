/* tslint:disable: no-any */
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as date_fns from "date-fns";
import { OrchestrationRuntimeStatus } from "durable-functions/lib/src/classes";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { now } from "../../__mocks__/mock";
import { StatusEnum as ActivatedStatusEnum } from "../../generated/definitions/CardActivated";
import {
  CardPending,
  StatusEnum as PendingStatusEnum
} from "../../generated/definitions/CardPending";
import { CcdbNumber } from "../../generated/definitions/CcdbNumber";
import { StatusEnum } from "../../generated/definitions/CgnActivationDetail";
import { EycaActivationDetail } from "../../generated/definitions/EycaActivationDetail";
import { EycaCardActivated } from "../../generated/definitions/EycaCardActivated";
import { UserEycaCard } from "../../models/user_eyca_card";
import * as orchUtils from "../../utils/orchestrators";
import { GetEycaActivationHandler } from "../handler";

const aFiscalCode = "RODFDS82S10H501T" as FiscalCode;
const aCardNumber = "A123-A123-A123-A123" as CcdbNumber;

const anInstanceId = {
  id: orchUtils.makeUpdateCgnOrchestratorId(
    aFiscalCode,
    "ACTIVATED"
  ) as NonEmptyString
};
const aCompletedResponse: EycaActivationDetail = {
  status: StatusEnum.COMPLETED
};
const aPendingEycaCard: CardPending = {
  status: PendingStatusEnum.PENDING
};

const anActivatedEyca: EycaCardActivated = {
  activation_date: now,
  card_number: aCardNumber,
  expiration_date: date_fns.addDays(now, 10),
  status: ActivatedStatusEnum.ACTIVATED
};

const aUserEycaCard: UserEycaCard = {
  card: aPendingEycaCard,
  fiscalCode: aFiscalCode
};

const findLastVersionByModelIdMock = jest
  .fn()
  .mockImplementation(() =>
    TE.of(O.some({ ...aUserEycaCard, card: anActivatedEyca }))
  );
const userEycaCardModelMock = {
  findLastVersionByModelId: findLastVersionByModelIdMock
};

const getOrchestratorStatusMock = jest
  .fn()
  .mockImplementation((_, __) =>
    TE.of({ instanceId: anInstanceId, customStatus: "COMPLETED" })
  );
jest
  .spyOn(orchUtils, "getOrchestratorStatus")
  .mockImplementation(getOrchestratorStatusMock);

describe("GetEycaActivationHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should return success with ERROR status if orchestrator status is Failed", async () => {
    getOrchestratorStatusMock.mockImplementationOnce(() =>
      TE.of({
        createdTime: now,
        instanceId: anInstanceId,
        runtimeStatus: OrchestrationRuntimeStatus.Failed
      })
    );
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      TE.of(O.some({ ...aUserEycaCard }))
    );
    const handler = GetEycaActivationHandler(userEycaCardModelMock as any);
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseSuccessJson");
    if (response.kind === "IResponseSuccessJson") {
      expect(response.value).toEqual({
        ...aCompletedResponse,
        created_at: now,
        last_updated_at: undefined,
        status: StatusEnum.ERROR
      });
    }
  });

  it("should return success with RUNNING status if orchestrator status is Running", async () => {
    getOrchestratorStatusMock.mockImplementationOnce(() =>
      TE.of({
        instanceId: anInstanceId,
        runtimeStatus: OrchestrationRuntimeStatus.Running
      })
    );
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      TE.of(O.some({ ...aUserEycaCard }))
    );
    const handler = GetEycaActivationHandler(userEycaCardModelMock as any);
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseSuccessJson");
    if (response.kind === "IResponseSuccessJson") {
      expect(response.value).toEqual({
        ...aCompletedResponse,
        status: StatusEnum.RUNNING
      });
    }
  });
  it("should return success if an orchestrator's custom status is UPDATED", async () => {
    const handler = GetEycaActivationHandler(userEycaCardModelMock as any);
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseSuccessJson");
    if (response.kind === "IResponseSuccessJson") {
      expect(response.value).toEqual(aCompletedResponse);
    }
  });

  it("should return success if an orchestrator's custom status is COMPLETED", async () => {
    getOrchestratorStatusMock.mockImplementationOnce(() =>
      TE.of({ instanceId: anInstanceId, customStatus: "COMPLETED" })
    );
    const handler = GetEycaActivationHandler(userEycaCardModelMock as any);
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseSuccessJson");
    if (response.kind === "IResponseSuccessJson") {
      expect(response.value).toEqual(aCompletedResponse);
    }
  });

  it("should return an internal error if there are errors to retrieve a UserCgn", async () => {
    getOrchestratorStatusMock.mockImplementationOnce(() => TE.of(undefined));
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      TE.left(new Error("Query Error"))
    );
    const handler = GetEycaActivationHandler(userEycaCardModelMock as any);
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return Not found if infos about orchestrator status and UserCgn are missing", async () => {
    getOrchestratorStatusMock.mockImplementationOnce(() => TE.of(undefined));
    findLastVersionByModelIdMock.mockImplementationOnce(() => TE.of(O.none));
    const handler = GetEycaActivationHandler(userEycaCardModelMock as any);
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorNotFound");
  });

  it("should return Not found if infos about orchestrator status are not recognized and UserCgn are missing", async () => {
    getOrchestratorStatusMock.mockImplementationOnce(() =>
      TE.of({
        instanceId: anInstanceId,
        runtimeStatus: OrchestrationRuntimeStatus.Canceled
      })
    );
    findLastVersionByModelIdMock.mockImplementationOnce(() => TE.of(O.none));
    const handler = GetEycaActivationHandler(userEycaCardModelMock as any);
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorNotFound");
  });

  it("should return success with COMPLETED status if orchestrator infos are missing and userCgn is already activated", async () => {
    getOrchestratorStatusMock.mockImplementationOnce(() => TE.of(undefined));
    const handler = GetEycaActivationHandler(userEycaCardModelMock as any);
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseSuccessJson");
    if (response.kind === "IResponseSuccessJson") {
      expect(response.value).toEqual(aCompletedResponse);
    }
  });

  it("should return success with COMPLETED status if orchestrator check status raise an error but userCgn is already activated", async () => {
    getOrchestratorStatusMock.mockImplementationOnce(() =>
      TE.left(new Error("Cannot recognize orchestrator status"))
    );

    const handler = GetEycaActivationHandler(userEycaCardModelMock as any);
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseSuccessJson");
    if (response.kind === "IResponseSuccessJson") {
      expect(response.value).toEqual(aCompletedResponse);
    }
  });

  it("should return success with PENDING status if orchestrator infos are missing and userCgn is PENDING", async () => {
    getOrchestratorStatusMock.mockImplementationOnce(() => TE.of(undefined));
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      TE.of(O.some({ ...aUserEycaCard }))
    );
    const handler = GetEycaActivationHandler(userEycaCardModelMock as any);
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseSuccessJson");
    if (response.kind === "IResponseSuccessJson") {
      expect(response.value).toEqual({
        ...aCompletedResponse,
        status: StatusEnum.PENDING
      });
    }
  });

  it("should return success with COMPLETED status if the orchestrator is terminated and userCgn is ACTIVATED", async () => {
    getOrchestratorStatusMock.mockImplementationOnce(() =>
      TE.of({
        instanceId: anInstanceId,
        runtimeStatus: OrchestrationRuntimeStatus.Terminated
      })
    );

    const handler = GetEycaActivationHandler(userEycaCardModelMock as any);
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseSuccessJson");
    if (response.kind === "IResponseSuccessJson") {
      expect(response.value).toEqual({
        ...aCompletedResponse,
        status: StatusEnum.COMPLETED
      });
    }
  });

  it("should return success with COMPLETED status if custom status is UPDATED and userCgn is ACTIVATED", async () => {
    getOrchestratorStatusMock.mockImplementationOnce(() =>
      TE.of({
        customStatus: "UPDATED",
        instanceId: anInstanceId,
        runtimeStatus: OrchestrationRuntimeStatus.Running
      })
    );
    const handler = GetEycaActivationHandler(userEycaCardModelMock as any);
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseSuccessJson");
    if (response.kind === "IResponseSuccessJson") {
      expect(response.value).toEqual({
        ...aCompletedResponse,
        status: StatusEnum.COMPLETED
      });
    }
  });
});
