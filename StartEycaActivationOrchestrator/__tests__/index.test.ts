// eslint-disable sort-keys

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

describe("StartEycaActivationOrchestrator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should call the right activity to activate an EYCA card", async () => {
    mockCallActivityWithRetry
      // 1 SuccessEycaActivationActivity
      .mockReturnValueOnce({ kind: "SUCCESS" })
      .mockReturnValueOnce({ kind: "SUCCESS" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-type-assertion
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
      "COMPLETED"
    );
    expect(res).toStrictEqual({ done: true, value: undefined });
  });

  it("should retry if it cannot decode activation output", async () => {
    mockCallActivityWithRetry
      // 1 SuccessEycaActivationActivity
      .mockReturnValueOnce({ kind: "WRONG" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-type-assertion
    const orchestrator = handler(contextMockWithDf as any);

    // Complete the orchestrator execution
    const res = orchestrator.next();
    expect(res).toMatchObject({ value: { kind: "WRONG" } });

    expect(contextMockWithDf.df.setCustomStatus).toHaveBeenNthCalledWith(
      1,
      "RUNNING"
    );
  });

  it("should retry if EYCA expiration date store fails", async () => {
    mockCallActivityWithRetry
      // 1 SuccessEycaActivationActivity
      .mockReturnValueOnce({ kind: "FAILURE" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-type-assertion
    const orchestrator = handler(contextMockWithDf as any);

    const res1 = orchestrator.next();
    expect(res1.value).toEqual({
      kind: "FAILURE"
    });

    // Complete the orchestrator execution
    const res = orchestrator.next(res1.value);
    expect(res).toMatchObject({ value: false });

    expect(contextMockWithDf.df.setCustomStatus).toHaveBeenNthCalledWith(
      1,
      "RUNNING"
    );
  });

  it("should retry if EYCA activation fails", async () => {
    mockCallActivityWithRetry
      // 1 SuccessEycaActivationActivity
      .mockReturnValueOnce({ kind: "SUCCESS" })
      .mockReturnValueOnce({ kind: "FAILURE" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-type-assertion
    const orchestrator = handler(contextMockWithDf as any);

    const res1 = orchestrator.next();
    const res2 = orchestrator.next(res1.value);

    expect(res2).toMatchObject({ done: false });
    expect(res2.value).toEqual({
      kind: "FAILURE"
    });

    // Complete the orchestrator execution
    const res = orchestrator.next(res2.value);
    expect(res).toMatchObject({ done: true });

    expect(contextMockWithDf.df.setCustomStatus).toHaveBeenNthCalledWith(
      1,
      "RUNNING"
    );
  });
});
