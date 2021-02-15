// tslint:disable: object-literal-sort-keys

import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import { EycaCardActivated } from "../../generated/definitions/EycaCardActivated";
import { extractEycaExpirationDate } from "../../utils/cgn_checks";
import { StatusEnum as ActivatedStatusEnum } from "../../generated/definitions/CardActivated";
import { context as contextMock } from "../../__mocks__/durable-functions";
import { now } from "../../__mocks__/mock";
import { handler } from "../index";
import { CcdbNumber } from "../../generated/eyca-api/CcdbNumber";

const aFiscalCode = "RODFDS82S10H501T" as FiscalCode;
const aUserEycaCardNumber = "X321-Y321-Z321-W321" as CcdbNumber;

const anActivatedEycaCard: EycaCardActivated = {
  activation_date: now,
  card_number: aUserEycaCardNumber,
  expiration_date: extractEycaExpirationDate(aFiscalCode).value as Date,
  status: ActivatedStatusEnum.ACTIVATED
};

const getInputMock = jest.fn().mockImplementation(() => ({
  fiscalCode: aFiscalCode
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
      .mockReturnValueOnce({ kind: "SUCCESS", value: anActivatedEycaCard });
    // tslint:disable-next-line: no-any no-useless-cast
    const orchestrator = handler(contextMockWithDf as any);

    const res1 = orchestrator.next();
    expect(res1.value.kind).toEqual("SUCCESS");
    expect(res1.value.value).toEqual(anActivatedEycaCard);

    // Complete the orchestrator execution
    const res2 = orchestrator.next(res1.value);
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
    // tslint:disable-next-line: no-any no-useless-cast
    const orchestrator = handler(contextMockWithDf as any);

    // Complete the orchestrator execution
    const res = orchestrator.next();
    expect(res).toMatchObject({ value: { kind: "WRONG" } });

    expect(contextMockWithDf.df.setCustomStatus).toHaveBeenNthCalledWith(
      1,
      "RUNNING"
    );
  });

  it("should retry if EYCA activation fails", async () => {
    mockCallActivityWithRetry
      // 1 SuccessEycaActivationActivity
      .mockReturnValueOnce({ kind: "FAILURE" });
    // tslint:disable-next-line: no-any no-useless-cast
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

  it("should retry if EYCA expiration date store fails", async () => {
    mockCallActivityWithRetry
      // 1 SuccessEycaActivationActivity
      .mockReturnValueOnce({ kind: "SUCCESS", value: anActivatedEycaCard })
      .mockReturnValueOnce({ kind: "FAILURE" });
    // tslint:disable-next-line: no-any no-useless-cast
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
