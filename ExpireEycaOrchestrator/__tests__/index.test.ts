// tslint:disable: object-literal-sort-keys

import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { context as contextMock } from "../../__mocks__/durable-functions";
import { handler } from "../index";

const aFiscalCode = "RODFDS82S10H501T" as FiscalCode;

const getInputMock = jest.fn().mockImplementation(() => ({
  fiscalCode: aFiscalCode,
  activationDate: new Date(),
  expirationDate: new Date()
}));

const mockCallActivityWithRetry = jest.fn();

const contextMockWithDf = {
  ...contextMock,
  df: {
    callActivity: jest.fn(),
    callActivityWithRetry: mockCallActivityWithRetry,
    getInput: getInputMock,
    setCustomStatus: jest.fn(),
    createTimer: jest.fn().mockReturnValue("CreateTimer")
  }
};

describe("ExpireEycaOrchestrator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should call the right activity to expire an EYCA card", async () => {
    mockCallActivityWithRetry
      // 1 SuccessEycaActivationActivity
      .mockReturnValueOnce({ kind: "SUCCESS" })
      .mockReturnValueOnce({ kind: "SUCCESS" });
    // tslint:disable-next-line: no-any no-useless-cast
    const orchestrator = handler(contextMockWithDf as any);

    const res1 = orchestrator.next();
    expect(res1.value.kind).toEqual("SUCCESS");

    // Complete the orchestrator execution
    const res2 = orchestrator.next(res1.value);
    expect(res2.value.kind).toEqual("SUCCESS");

    const res = orchestrator.next(res2.value);

    orchestrator.next(res);

    expect(contextMockWithDf.df.setCustomStatus).toHaveBeenNthCalledWith(
      1,
      "RUNNING"
    );
    expect(contextMockWithDf.df.setCustomStatus).toHaveBeenNthCalledWith(
      2,
      "UPDATED"
    );
    expect(contextMockWithDf.df.setCustomStatus).toHaveBeenNthCalledWith(
      3,
      "COMPLETED"
    );
    expect(res).toStrictEqual({ done: true, value: undefined });
  });

  it("should retry if it cannot decode expiration output", async () => {
    mockCallActivityWithRetry
      // 1 SuccessEycaActivationActivity
      .mockReturnValueOnce({ kind: "WRONG" });
    // tslint:disable-next-line: no-any no-useless-cast
    const orchestrator = handler(contextMockWithDf as any);

    const res1 = orchestrator.next();
    expect(res1).toMatchObject({ value: { kind: "WRONG" } });
    // Complete the orchestrator execution
    const res = orchestrator.next(res1.value);
    expect(res).toMatchObject({ value: false });

    expect(contextMockWithDf.df.setCustomStatus).toHaveBeenNthCalledWith(
      1,
      "RUNNING"
    );
    expect(contextMockWithDf.df.setCustomStatus).toHaveBeenNthCalledWith(
      2,
      "ERROR"
    );
  });

  it("should retry if EYCA expiration fails", async () => {
    mockCallActivityWithRetry
      // 1 SuccessEycaActivationActivity
      .mockReturnValueOnce({ kind: "FAILURE", reason: "Reason" });
    // tslint:disable-next-line: no-any no-useless-cast
    const orchestrator = handler(contextMockWithDf as any);

    const res1 = orchestrator.next();
    expect(res1.value).toEqual({
      kind: "FAILURE",
      reason: "Reason"
    });

    // Complete the orchestrator execution
    const res = orchestrator.next(res1.value);
    expect(res).toMatchObject({ value: false });

    expect(contextMockWithDf.df.setCustomStatus).toHaveBeenNthCalledWith(
      1,
      "RUNNING"
    );
  });
});
