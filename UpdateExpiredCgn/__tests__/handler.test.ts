/* tslint:disable: no-any */
import { taskEither } from "fp-ts/lib/TaskEither";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import {
  context,
  mockReadEntityState,
  mockStartNew
} from "../../__mocks__/durable-functions";
import * as orchUtils from "../../utils/orchestrators";
import { getUpdateExpiredCgnHandler } from "../handler";

// tslint:disable-next-line: readonly-array
const aSetOfFiscalCodes: FiscalCode[] = [
  "RODFDS82S10H501T" as FiscalCode,
  "RODEDS80S10H501T" as FiscalCode
];

const terminateOrchestratorMock = jest
  .fn()
  .mockImplementation(() => taskEither.of(void 0));
jest
  .spyOn(orchUtils, "terminateOrchestratorTask")
  .mockImplementation(terminateOrchestratorMock);
describe("UpdateExpiredCgn", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should process all fiscalCodes present on table", async () => {
    mockReadEntityState.mockImplementationOnce(() =>
      Promise.resolve({
        entityState: aSetOfFiscalCodes
      })
    );
    const updateExpiredCgnHandler = getUpdateExpiredCgnHandler();
    await updateExpiredCgnHandler(context);
    expect(mockStartNew).toBeCalledTimes(aSetOfFiscalCodes.length);
  });

  it("should terminate other orchestrators running for activation and revocation", async () => {
    mockReadEntityState.mockImplementationOnce(() =>
      Promise.resolve({
        entityState: aSetOfFiscalCodes
      })
    );
    const updateExpiredCgnHandler = getUpdateExpiredCgnHandler();
    await updateExpiredCgnHandler(context);
    expect(terminateOrchestratorMock).toBeCalledTimes(
      aSetOfFiscalCodes.length * 2
    );
  });

  it("should not instantiate any orchestrator if there are no elements to process", async () => {
    mockReadEntityState.mockImplementationOnce(() =>
      Promise.resolve({
        entityState: []
      })
    );
    const updateExpiredCgnHandler = getUpdateExpiredCgnHandler();
    await updateExpiredCgnHandler(context);
    expect(mockStartNew).not.toHaveBeenCalled();
  });
});
