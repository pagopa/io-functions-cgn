// tslint:disable: object-literal-sort-keys

import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import { context as contextMock } from "../../__mocks__/durable-functions";
import {
  CgnRevokedStatus,
  StatusEnum as RevokedCgnStatusEnum
} from "../../generated/definitions/CgnRevokedStatus";
import { ActivityResult as UpdateCgnStatusActivityResult } from "../../UpdateCgnStatusActivity/handler";
import { MESSAGES } from "../../utils/messages";
import { handler } from "../index";

const aFiscalCode = "RODFDS82S10H501T" as FiscalCode;
const now = new Date();
const aReason = "aMotivation" as NonEmptyString;

const aUserCgnRevokedStatus: CgnRevokedStatus = {
  revocation_reason: aReason,
  revocation_date: now,
  status: RevokedCgnStatusEnum.REVOKED
};

const getInputMock = jest.fn();

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

const anUpdateCgnStatusResult: UpdateCgnStatusActivityResult = {
  kind: "SUCCESS"
};

describe("UpdateCgnOrchestrator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should send the right message", async () => {
    getInputMock.mockImplementationOnce(() => ({
      fiscalCode: aFiscalCode,
      newStatus: aUserCgnRevokedStatus
    }));
    mockCallActivityWithRetry
      // 1 UpdateCgnStauts
      .mockReturnValueOnce(anUpdateCgnStatusResult)
      // 5 SendMessageActivity
      .mockReturnValueOnce("SendMessageActivity");
    // tslint:disable-next-line: no-any no-useless-cast
    const orchestrator = handler(contextMockWithDf as any);

    // 1 UpdateCgnStauts
    const res1 = orchestrator.next();
    expect(res1.value).toEqual({
      kind: "SUCCESS"
    });

    // 2 CreateTimer
    const res2 = orchestrator.next(res1.value);
    expect(res2.value).toEqual("CreateTimer");

    // 3 SendMessageActivity
    const res3 = orchestrator.next(res2.value);
    expect(res3.value).toEqual("SendMessageActivity");

    // Complete the orchestrator execution
    orchestrator.next();

    expect(contextMockWithDf.df.createTimer).toHaveBeenCalledTimes(1);
    expect(contextMockWithDf.df.setCustomStatus).toHaveBeenNthCalledWith(
      1,
      "RUNNING"
    );
    expect(contextMockWithDf.df.setCustomStatus).toHaveBeenNthCalledWith(
      2,
      "COMPLETED"
    );
  });

  it("should send the right message on a revoked Cgn", async () => {
    getInputMock.mockImplementationOnce(() => ({
      fiscalCode: aFiscalCode,
      newStatus: aUserCgnRevokedStatus
    }));
    mockCallActivityWithRetry
      // 1 UpdateCgnStauts
      .mockReturnValueOnce(anUpdateCgnStatusResult)
      // 5 SendMessageActivity
      .mockReturnValueOnce("SendMessageActivity");
    // tslint:disable-next-line: no-any no-useless-cast
    const orchestrator = handler(contextMockWithDf as any);

    // 1 UpdateCgnStauts
    const res1 = orchestrator.next();
    expect(res1.value).toEqual({
      kind: "SUCCESS"
    });

    // 2 CreateTimer
    const res2 = orchestrator.next(res1.value);
    expect(res2.value).toEqual("CreateTimer");

    // 3 SendMessageActivity
    const res3 = orchestrator.next(res2.value);
    expect(res3.value).toEqual("SendMessageActivity");

    // Complete the orchestrator execution
    orchestrator.next();

    expect(
      contextMockWithDf.df.callActivityWithRetry.mock.calls[1][2].content
    ).toEqual(MESSAGES.CgnRevokedStatus(aUserCgnRevokedStatus));

    expect(contextMockWithDf.df.createTimer).toHaveBeenCalledTimes(1);
    expect(contextMockWithDf.df.setCustomStatus).toHaveBeenNthCalledWith(
      1,
      "RUNNING"
    );
    expect(contextMockWithDf.df.setCustomStatus).toHaveBeenNthCalledWith(
      2,
      "COMPLETED"
    );
  });
});
