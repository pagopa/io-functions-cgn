/* tslint:disable: no-any */
import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import {
  context,
  mockStartNew,
  mockTerminate
} from "../../__mocks__/durable-functions";
import * as orchUtils from "../../utils/orchestrators";
import { getUpdateExpiredCgnHandler } from "../handler";
import * as tableUtils from "../table";

// tslint:disable-next-line: readonly-array
const aSetOfFiscalCodes: FiscalCode[] = [
  "RODFDS82S10H501T" as FiscalCode,
  "RODEDS80S10H501T" as FiscalCode
];
const tableServiceMock = jest.fn();
const expiredCgnTableName = "aTable" as NonEmptyString;

const getExpiredCgnUsersMock = jest.fn();
jest
  .spyOn(tableUtils, "getExpiredCgnUsers")
  .mockImplementation(getExpiredCgnUsersMock);

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
    getExpiredCgnUsersMock.mockImplementationOnce(() =>
      taskEither.of(aSetOfFiscalCodes)
    );
    const updateExpiredCgnHandler = getUpdateExpiredCgnHandler(
      tableServiceMock as any,
      expiredCgnTableName
    );
    await updateExpiredCgnHandler(context);
    expect(mockStartNew).toBeCalledTimes(aSetOfFiscalCodes.length);
  });

  it("should terminate other orchestrators running for activation and revocation", async () => {
    getExpiredCgnUsersMock.mockImplementationOnce(() =>
      taskEither.of(aSetOfFiscalCodes)
    );
    const updateExpiredCgnHandler = getUpdateExpiredCgnHandler(
      tableServiceMock as any,
      expiredCgnTableName
    );
    await updateExpiredCgnHandler(context);
    expect(terminateOrchestratorMock).toBeCalledTimes(
      aSetOfFiscalCodes.length * 2
    );
  });

  it("should not instantiate any orchestrator if there are no elements to process", async () => {
    getExpiredCgnUsersMock.mockImplementationOnce(() => taskEither.of([]));
    const updateExpiredCgnHandler = getUpdateExpiredCgnHandler(
      tableServiceMock as any,
      expiredCgnTableName
    );
    await updateExpiredCgnHandler(context);
    expect(mockStartNew).not.toHaveBeenCalled();
  });

  it("should not instantiate any orchestrator if there are errors querying table", async () => {
    getExpiredCgnUsersMock.mockImplementationOnce(() =>
      fromLeft(new Error("Cannot query table"))
    );
    const updateExpiredCgnHandler = getUpdateExpiredCgnHandler(
      tableServiceMock as any,
      expiredCgnTableName
    );
    await updateExpiredCgnHandler(context);
    expect(mockStartNew).not.toHaveBeenCalled();
  });
});
