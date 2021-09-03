// tslint:disable: no-any
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as df from "durable-functions";
import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";
import { getClient, mockGetStatus } from "../../__mocks__/durable-functions";
import { StatusEnum } from "../../generated/definitions/CardPending";
import * as orchUtils from "../orchestrators";

const aFiscalCode = "DROLSS85S20H501F" as FiscalCode;
const aTerminationReason = "aReason" as NonEmptyString;

const mockGetOrchestratorStatus = jest.fn();
jest
  .spyOn(orchUtils, "getOrchestratorStatus")
  .mockImplementation(mockGetOrchestratorStatus);

const getStatusMock = jest
  .fn()
  .mockImplementation(() =>
    Promise.resolve({ runtimeStatus: df.OrchestrationRuntimeStatus.Pending })
  );
const terminateMock = jest
  .fn()
  .mockImplementation(() => Promise.resolve(void 0));
const client = {
  getStatus: getStatusMock,
  terminate: terminateMock
};
describe("isOrchestratorRunning", () => {
  it("should return true if an orchestrator is running", async () => {
    mockGetOrchestratorStatus.mockImplementationOnce(() =>
      TE.of({
        runtimeStatus: df.OrchestrationRuntimeStatus.Running
      })
    );
    const isOrchestratorRunningResult = await orchUtils.isOrchestratorRunning(
      getClient as any,
      "ID"
    )();
    expect(E.isRight(isOrchestratorRunningResult));
    if (E.isRight(isOrchestratorRunningResult)) {
      expect(isOrchestratorRunningResult.right.isRunning).toEqual(true);
    }
  });

  it("should return false if an orchestrator is not running or pending", async () => {
    mockGetOrchestratorStatus.mockImplementationOnce(() =>
      TE.of({
        runtimeStatus: df.OrchestrationRuntimeStatus.Completed
      })
    );
    const isOrchestratorRunningResult = await orchUtils.isOrchestratorRunning(
      getClient as any,
      "ID"
    )();
    expect(E.isRight(isOrchestratorRunningResult));
    if (E.isRight(isOrchestratorRunningResult)) {
      expect(isOrchestratorRunningResult.right.isRunning).toEqual(false);
    }
  });

  it("should return an error when error occurs while checking orchestrator's status", async () => {
    mockGetOrchestratorStatus.mockImplementationOnce(() =>
      TE.left(new Error("Cannot recognize orchestrator status"))
    );
    const isOrchestratorRunningResult = await orchUtils.isOrchestratorRunning(
      getClient as any,
      "ID"
    )();
    expect(E.isLeft(isOrchestratorRunningResult));
  });
});

describe("checkUpdateCardIsRunning", () => {
  it("should return an accepted response if an orchestrator is running", async () => {
    mockGetOrchestratorStatus.mockImplementationOnce(() =>
      TE.of({
        runtimeStatus: df.OrchestrationRuntimeStatus.Running
      })
    );
    const checkUpdateCardIsRunningResult = await orchUtils.checkUpdateCardIsRunning(
      getClient as any,
      aFiscalCode,
      {
        status: StatusEnum.PENDING
      }
    )();
    expect(E.isLeft(checkUpdateCardIsRunningResult));
    if (E.isLeft(checkUpdateCardIsRunningResult)) {
      expect(checkUpdateCardIsRunningResult.left.kind).toEqual(
        "IResponseSuccessAccepted"
      );
    }
  });

  it("should return an internal error response if an error occurs while checking orchestrator status", async () => {
    mockGetOrchestratorStatus.mockImplementationOnce(() =>
      TE.left(new Error("Cannot recognize orchestrator status"))
    );
    const checkUpdateCardIsRunningResult = await orchUtils.checkUpdateCardIsRunning(
      getClient as any,
      aFiscalCode,
      {
        status: StatusEnum.PENDING
      }
    )();
    expect(E.isLeft(checkUpdateCardIsRunningResult));
    if (E.isLeft(checkUpdateCardIsRunningResult)) {
      expect(checkUpdateCardIsRunningResult.left.kind).toEqual(
        "IResponseErrorInternal"
      );
    }
  });
});

describe("terminateUpdateCgnOrchestratorTask", () => {
  it("should return void if a REVOKE orchestrator is terminated successfully", async () => {
    const terminateUpdateCgnOrchestratorTaskResult = await orchUtils.terminateUpdateCgnOrchestratorTask(
      client as any,
      aFiscalCode,
      "REVOKED",
      aTerminationReason
    )();
    expect(E.isRight(terminateUpdateCgnOrchestratorTaskResult));
  });

  it("should return void if no info about orchestrator status was retrieved", async () => {
    getStatusMock.mockImplementationOnce(() => Promise.resolve(undefined));
    const terminateUpdateCgnOrchestratorTaskResult = await orchUtils.terminateUpdateCgnOrchestratorTask(
      client as any,
      aFiscalCode,
      "REVOKED",
      aTerminationReason
    )();
    expect(E.isRight(terminateUpdateCgnOrchestratorTaskResult));
  });

  it("should return void if orchestrator's termination fails", async () => {
    terminateMock.mockImplementationOnce(() =>
      Promise.reject(new Error("Cannot recognize orchestrator ID"))
    );

    const terminateUpdateCgnOrchestratorTaskResult = await orchUtils.terminateUpdateCgnOrchestratorTask(
      client as any,
      aFiscalCode,
      "REVOKED",
      aTerminationReason
    )();
    expect(E.isRight(terminateUpdateCgnOrchestratorTaskResult));
  });
});
