/* tslint:disable: no-any */

import * as date_fns from "date-fns";
import { OrchestrationRuntimeStatus } from "durable-functions/lib/src/classes";
import { some } from "fp-ts/lib/Option";
import { none } from "fp-ts/lib/Option";
import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { now } from "../../__mocks__/mock";
import {
  CgnActivatedStatus,
  StatusEnum as ActivatedStatusEnum
} from "../../generated/definitions/CgnActivatedStatus";
import {
  CgnActivationDetail,
  StatusEnum
} from "../../generated/definitions/CgnActivationDetail";
import {
  CgnPendingStatus,
  StatusEnum as PendingStatusEnum
} from "../../generated/definitions/CgnPendingStatus";
import { UserCgn } from "../../models/user_cgn";
import * as orchUtils from "../../utils/orchestrators";
import { GetCgnActivationHandler } from "../handler";

const aFiscalCode = "RODFDS82S10H501T" as FiscalCode;
const aUserCgnId = "AN_ID" as NonEmptyString;

const findLastVersionByModelIdMock = jest.fn();
const userCgnModelMock = {
  findLastVersionByModelId: findLastVersionByModelIdMock
};
const anInstanceId = {
  id: orchUtils.makeUpdateCgnOrchestratorId(
    aFiscalCode,
    "ACTIVATED"
  ) as NonEmptyString
};
const aCompletedResponse: CgnActivationDetail = {
  instance_id: anInstanceId,
  status: StatusEnum.COMPLETED
};
const aPendingCgnStatus: CgnPendingStatus = {
  status: PendingStatusEnum.PENDING
};

const anActivatedCgnStatus: CgnActivatedStatus = {
  activation_date: now,
  expiration_date: date_fns.addDays(now, 10),
  status: ActivatedStatusEnum.ACTIVATED
};

const aUserCgn: UserCgn = {
  fiscalCode: aFiscalCode,
  id: aUserCgnId,
  status: aPendingCgnStatus
};

const getOrchestratorStatusMock = jest
  .fn()
  .mockImplementation((_, __) =>
    taskEither.of({ instanceId: anInstanceId, customStatus: "UPDATED" })
  );
jest
  .spyOn(orchUtils, "getOrchestratorStatus")
  .mockImplementation(getOrchestratorStatusMock);

describe("GetCgnActivationHandler", () => {
  it("should return success with ERROR status if orchestrator status is Failed", async () => {
    getOrchestratorStatusMock.mockImplementationOnce(() =>
      taskEither.of({
        instanceId: anInstanceId,
        runtimeStatus: OrchestrationRuntimeStatus.Failed
      })
    );
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some({ ...aUserCgn }))
    );
    const handler = GetCgnActivationHandler(userCgnModelMock as any);
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseSuccessJson");
    if (response.kind === "IResponseSuccessJson") {
      expect(response.value).toEqual({
        ...aCompletedResponse,
        status: StatusEnum.ERROR
      });
    }
  });

  it("should return success with RUNNING status if orchestrator status is Running", async () => {
    getOrchestratorStatusMock.mockImplementationOnce(() =>
      taskEither.of({
        instanceId: anInstanceId,
        runtimeStatus: OrchestrationRuntimeStatus.Running
      })
    );
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some({ ...aUserCgn }))
    );
    const handler = GetCgnActivationHandler(userCgnModelMock as any);
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
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some({ ...aUserCgn, status: anActivatedCgnStatus }))
    );
    const handler = GetCgnActivationHandler(userCgnModelMock as any);
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseSuccessJson");
    if (response.kind === "IResponseSuccessJson") {
      expect(response.value).toEqual(aCompletedResponse);
    }
  });

  it("should return success if an orchestrator's custom status is COMPLETED", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some({ ...aUserCgn, status: anActivatedCgnStatus }))
    );

    getOrchestratorStatusMock.mockImplementationOnce(() =>
      taskEither.of({ instanceId: anInstanceId, customStatus: "COMPLETED" })
    );
    const handler = GetCgnActivationHandler(userCgnModelMock as any);
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseSuccessJson");
    if (response.kind === "IResponseSuccessJson") {
      expect(response.value).toEqual(aCompletedResponse);
    }
  });

  it("should return an internal error if there are errors to retrieve a UserCgn", async () => {
    getOrchestratorStatusMock.mockImplementationOnce(() =>
      taskEither.of(undefined)
    );
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      fromLeft(new Error("Query Error"))
    );
    const handler = GetCgnActivationHandler(userCgnModelMock as any);
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return Not found if infos about orchestrator status and UserCgn are missing", async () => {
    getOrchestratorStatusMock.mockImplementationOnce(() =>
      taskEither.of(undefined)
    );
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(none)
    );
    const handler = GetCgnActivationHandler(userCgnModelMock as any);
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorNotFound");
  });

  it("should return Not found if infos about orchestrator status are not recognized and UserCgn are missing", async () => {
    getOrchestratorStatusMock.mockImplementationOnce(() =>
      taskEither.of({
        instanceId: anInstanceId,
        runtimeStatus: OrchestrationRuntimeStatus.Canceled
      })
    );
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(none)
    );
    const handler = GetCgnActivationHandler(userCgnModelMock as any);
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorNotFound");
  });

  it("should return success with COMPLETED status if orchestrator infos are missing and userCgn is already activated", async () => {
    getOrchestratorStatusMock.mockImplementationOnce(() =>
      taskEither.of(undefined)
    );
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some({ ...aUserCgn, status: anActivatedCgnStatus }))
    );
    const handler = GetCgnActivationHandler(userCgnModelMock as any);
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseSuccessJson");
    if (response.kind === "IResponseSuccessJson") {
      expect(response.value).toEqual(aCompletedResponse);
    }
  });

  it("should return success with COMPLETED status if orchestrator check status raise an error but userCgn is already activated", async () => {
    getOrchestratorStatusMock.mockImplementationOnce(() =>
      fromLeft(new Error("Cannot recognize orchestrator status"))
    );
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some({ ...aUserCgn, status: anActivatedCgnStatus }))
    );
    const handler = GetCgnActivationHandler(userCgnModelMock as any);
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseSuccessJson");
    if (response.kind === "IResponseSuccessJson") {
      expect(response.value).toEqual(aCompletedResponse);
    }
  });

  it("should return success with PENDING status if orchestrator infos are missing and userCgn is PENDING", async () => {
    getOrchestratorStatusMock.mockImplementationOnce(() =>
      taskEither.of(undefined)
    );
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some({ ...aUserCgn }))
    );
    const handler = GetCgnActivationHandler(userCgnModelMock as any);
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
      taskEither.of({
        instanceId: anInstanceId,
        runtimeStatus: OrchestrationRuntimeStatus.Terminated
      })
    );
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some({ ...aUserCgn, status: anActivatedCgnStatus }))
    );
    const handler = GetCgnActivationHandler(userCgnModelMock as any);
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
      taskEither.of({
        customStatus: "UPDATED",
        instanceId: anInstanceId,
        runtimeStatus: OrchestrationRuntimeStatus.Running
      })
    );
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some({ ...aUserCgn, status: anActivatedCgnStatus }))
    );
    const handler = GetCgnActivationHandler(userCgnModelMock as any);
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
