// tslint:disable: object-literal-sort-keys

import * as date_fns from "date-fns";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import { context as contextMock } from "../../__mocks__/durable-functions";
import { cgnActivatedDates } from "../../__mocks__/mock";
import {
  CardActivatedStatus,
  StatusEnum
} from "../../generated/definitions/CardActivatedStatus";
import {
  CardExpiredStatus,
  StatusEnum as ExpiredStatusEnum
} from "../../generated/definitions/CardExpiredStatus";
import {
  CardRevokedStatus,
  StatusEnum as RevokedCgnStatusEnum
} from "../../generated/definitions/CardRevokedStatus";
import { ActivityResult as UpdateCgnStatusActivityResult } from "../../UpdateCgnStatusActivity/handler";
import { MESSAGES } from "../../utils/messages";
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

const anUpdateCgnStatusResult: UpdateCgnStatusActivityResult = {
  kind: "SUCCESS"
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
    orchestrator.next(res1.value);

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
