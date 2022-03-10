// tslint:disable: object-literal-sort-keys no-any

import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { context as contextMock } from "../../__mocks__/durable-functions";

import { CcdbNumber } from "../../generated/definitions/CcdbNumber";
import { DeleteCgnOrchestratorHandlerV2 as DeleteCgnOrchestratorHandler } from "../handler";

const aFiscalCode = "RODFDS82S10H501T" as FiscalCode;

const aUserEycaCardNumber = "X321-Y321-Z321-W321" as CcdbNumber;

const getInputMock = jest.fn().mockImplementation(() => ({
  fiscalCode: aFiscalCode,
  eycaCardNumber: aUserEycaCardNumber
}));

const mockCallActivityWithRetry = jest.fn();

const contextMockWithDf = {
  ...contextMock,
  df: {
    callActivity: jest.fn(),
    callActivityWithRetry: mockCallActivityWithRetry,
    getInput: getInputMock,
    setCustomStatus: jest.fn(),
    // 4 CreateTimer
    createTimer: jest.fn().mockReturnValue("CreateTimer")
  }
};

describe("DeleteCgnOrchestrator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should delete only cgn data when eyca is not present", async () => {
    getInputMock.mockImplementationOnce(() => ({
      fiscalCode: aFiscalCode
    }));
    mockCallActivityWithRetry
      // 1 UpsertSpecialServiceActivity pending
      .mockReturnValueOnce({ kind: "SUCCESS" })
      // 2 Delete Cgn Expiration Data
      .mockReturnValueOnce({ kind: "SUCCESS" })
      // 3 Delete Cgn Card
      .mockReturnValueOnce({ kind: "SUCCESS" })
      // 4 UpsertSpecialServiceActivity inactive
      .mockReturnValueOnce({ kind: "SUCCESS" });
    // tslint:disable-next-line: no-any no-useless-cast
    const orchestrator = DeleteCgnOrchestratorHandler(contextMockWithDf as any);

    // 1 UpsertSpecialServiceActivity
    const res1 = orchestrator.next();
    expect(res1.value).toEqual({
      kind: "SUCCESS"
    });

    // 2 Delete Cgn Expiration Data
    const res2 = orchestrator.next(res1.value);
    expect(res2.value).toEqual({
      kind: "SUCCESS"
    });

    // 3 Delete Cgn Card
    const res3 = orchestrator.next(res2.value);
    expect(res3.value).toEqual({
      kind: "SUCCESS"
    });

    // 4 UpsertSpecialServiceActivity
    const res4 = orchestrator.next(res3.value);
    expect(res4.value).toEqual({
      kind: "SUCCESS"
    });

    // Complete the orchestrator execution
    orchestrator.next(res4.value);

    expect(contextMockWithDf.df.callActivityWithRetry.mock.calls[1][2]).toEqual(
      {
        fiscalCode: aFiscalCode
      }
    );
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
  });

  it("should delete both cgn and eyca data when eyca is present", async () => {
    getInputMock.mockImplementationOnce(() => ({
      fiscalCode: aFiscalCode,
      eycaCardNumber: aUserEycaCardNumber
    }));
    mockCallActivityWithRetry
      // 1 UpsertSpecialServiceActivity pending
      .mockReturnValueOnce({ kind: "SUCCESS" })
      // 2 DeleteEycaRemoteActivity
      .mockReturnValueOnce({ kind: "SUCCESS" })
      // 3 DeleteEycaExpirationActivity
      .mockReturnValueOnce({ kind: "SUCCESS" })
      // 4 DeleteEycaActivity
      .mockReturnValueOnce({
        kind: "SUCCESS"
      })
      // 5 Delete Cgn Expiration Data
      .mockReturnValueOnce({ kind: "SUCCESS" })
      // 6 Delete Cgn Card
      .mockReturnValueOnce({ kind: "SUCCESS" })
      // 7 UpsertSpecialServiceActivity inactive
      .mockReturnValueOnce({ kind: "SUCCESS" });

    // tslint:disable-next-line: no-any no-useless-cast
    const orchestrator = DeleteCgnOrchestratorHandler(contextMockWithDf as any);

    // 1 UpsertSpecialServiceActivity
    const res1 = orchestrator.next();
    expect(res1.value).toEqual({
      kind: "SUCCESS"
    });

    // 2 DeleteEycaRemoteActivity
    const res2 = orchestrator.next(res1.value);
    expect(res2.value).toEqual({
      kind: "SUCCESS"
    });

    // 3 DeleteEycaExpirationActivity
    const res3 = orchestrator.next(res2.value);
    expect(res3.value).toEqual({
      kind: "SUCCESS"
    });

    // 4 DeleteEycaActivity
    const res4 = orchestrator.next(res3.value);
    expect(res4.value).toEqual({
      kind: "SUCCESS"
    });

    // 5 Delete Cgn Expiration Data
    const res5 = orchestrator.next(res4.value);
    expect(res5.value).toEqual({
      kind: "SUCCESS"
    });

    // 6 Delete Cgn Card
    const res6 = orchestrator.next(res5.value);
    expect(res6.value).toEqual({ kind: "SUCCESS" });

    // 7 UpsertSpecialServiceActivity
    const res7 = orchestrator.next(res6.value);
    expect(res7.value).toEqual({ kind: "SUCCESS" });

    // Complete the orchestrator execution
    orchestrator.next(res7.value);

    expect(contextMockWithDf.df.callActivityWithRetry.mock.calls[1][2]).toEqual(
      {
        cardNumber: aUserEycaCardNumber
      }
    );

    expect(contextMockWithDf.df.callActivityWithRetry.mock.calls[2][2]).toEqual(
      {
        fiscalCode: aFiscalCode
      }
    );

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
  });
});
