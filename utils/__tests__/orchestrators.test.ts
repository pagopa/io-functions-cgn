// tslint:disable: no-any
import * as df from "durable-functions";
import { isLeft, isRight } from "fp-ts/lib/Either";
import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import { getClient } from "../../__mocks__/durable-functions";
import { StatusEnum } from "../../generated/definitions/CgnPendingStatus";
import * as orchUtils from "../orchestrators";

const aFiscalCode = "DROLSS85S20H501F" as FiscalCode;

const mockGetOrchestratorStatus = jest.fn();
jest
  .spyOn(orchUtils, "getOrchestratorStatus")
  .mockImplementation(mockGetOrchestratorStatus);
describe("isOrchestratorRunning", () => {
  it("should return true if an orchestrator is running", async () => {
    mockGetOrchestratorStatus.mockImplementationOnce(() =>
      taskEither.of({
        runtimeStatus: df.OrchestrationRuntimeStatus.Running
      })
    );
    const isOrchestratorRunningResult = await orchUtils
      .isOrchestratorRunning(getClient as any, "ID")
      .run();
    expect(isRight(isOrchestratorRunningResult));
    if (isRight(isOrchestratorRunningResult)) {
      expect(isOrchestratorRunningResult.value.isRunning).toEqual(true);
    }
  });

  it("should return false if an orchestrator is not running or pending", async () => {
    mockGetOrchestratorStatus.mockImplementationOnce(() =>
      taskEither.of({
        runtimeStatus: df.OrchestrationRuntimeStatus.Completed
      })
    );
    const isOrchestratorRunningResult = await orchUtils
      .isOrchestratorRunning(getClient as any, "ID")
      .run();
    expect(isRight(isOrchestratorRunningResult));
    if (isRight(isOrchestratorRunningResult)) {
      expect(isOrchestratorRunningResult.value.isRunning).toEqual(false);
    }
  });

  it("should return an error when error occurs while checking orchestrator's status", async () => {
    mockGetOrchestratorStatus.mockImplementationOnce(() =>
      fromLeft(new Error("Cannot recognize orchestrator status"))
    );
    const isOrchestratorRunningResult = await orchUtils
      .isOrchestratorRunning(getClient as any, "ID")
      .run();
    expect(isLeft(isOrchestratorRunningResult));
  });
});

describe("checkUpdateCgnIsRunning", () => {
  it("should return an accepted response if an orchestrator is running", async () => {
    mockGetOrchestratorStatus.mockImplementationOnce(() =>
      taskEither.of({
        runtimeStatus: df.OrchestrationRuntimeStatus.Running
      })
    );
    const checkUpdateCgnIsRunningResult = await orchUtils
      .checkUpdateCgnIsRunning(getClient as any, aFiscalCode, {
        status: StatusEnum.PENDING
      })
      .run();
    expect(isLeft(checkUpdateCgnIsRunningResult));
    if (isLeft(checkUpdateCgnIsRunningResult)) {
      expect(checkUpdateCgnIsRunningResult.value.kind).toEqual(
        "IResponseSuccessAccepted"
      );
    }
  });

  it("should return an internal error response if an error occurs while checking orchestrator status", async () => {
    mockGetOrchestratorStatus.mockImplementationOnce(() =>
      fromLeft(new Error("Cannot recognize orchestrator status"))
    );
    const checkUpdateCgnIsRunningResult = await orchUtils
      .checkUpdateCgnIsRunning(getClient as any, aFiscalCode, {
        status: StatusEnum.PENDING
      })
      .run();
    expect(isLeft(checkUpdateCgnIsRunningResult));
    if (isLeft(checkUpdateCgnIsRunningResult)) {
      expect(checkUpdateCgnIsRunningResult.value.kind).toEqual(
        "IResponseErrorInternal"
      );
    }
  });
});
