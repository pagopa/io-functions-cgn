// tslint:disable: object-literal-sort-keys

import { FiscalCode } from "italia-ts-commons/lib/strings";
import { context as contextMock } from "../../__mocks__/durable-functions";
import { handler } from "../index";

const aFiscalCode = "RODFDS82S10H501T" as FiscalCode;

const getInputMock = jest.fn();

const mockCallActivityWithRetry = jest.fn();

const contextMockWithDf = {
  ...contextMock,
  df: {
    callActivity: jest.fn(),
    callActivityWithRetry: mockCallActivityWithRetry,
    getInput: getInputMock,
    setCustomStatus: jest.fn()
  }
};

describe("UpdateCgnOrchestrator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should call the right activity to activate an EYCA card", async () => {
    getInputMock.mockImplementationOnce(() => ({
      fiscalCode: aFiscalCode
    }));
    mockCallActivityWithRetry
      // 1 SuccessEycaActivationActivity
      .mockReturnValueOnce({ kind: "SUCCESS" });
    // tslint:disable-next-line: no-any no-useless-cast
    const orchestrator = handler(contextMockWithDf as any);

    // 1 StoreCgnExpiration
    const res1 = orchestrator.next();
    expect(res1.value).toEqual({
      kind: "SUCCESS"
    });

    // Complete the orchestrator execution
    const res = orchestrator.next(res1.value);

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

  it("should retry if it cannot decode activation output", async () => {
    getInputMock.mockImplementationOnce(() => ({
      fiscalCode: aFiscalCode
    }));
    mockCallActivityWithRetry
      // 1 SuccessEycaActivationActivity
      .mockReturnValueOnce({ kind: "WRONG" });
    // tslint:disable-next-line: no-any no-useless-cast
    const orchestrator = handler(contextMockWithDf as any);

    // 1 StoreCgnExpiration
    const res1 = orchestrator.next();

    // Complete the orchestrator execution
    const res = orchestrator.next(res1.value);
    expect(res).toMatchObject({ value: false });

    expect(contextMockWithDf.df.setCustomStatus).toHaveBeenNthCalledWith(
      1,
      "RUNNING"
    );
  });

  it("should retry if EYCA activation fails", async () => {
    getInputMock.mockImplementationOnce(() => ({
      fiscalCode: aFiscalCode
    }));
    mockCallActivityWithRetry
      // 1 SuccessEycaActivationActivity
      .mockReturnValueOnce({ kind: "FAILURE" });
    // tslint:disable-next-line: no-any no-useless-cast
    const orchestrator = handler(contextMockWithDf as any);

    // 1 StoreCgnExpiration
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
});
