/* tslint:disable: no-any */
import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { context, mockStartNew } from "../../__mocks__/durable-functions";
import { cgnActivatedDates } from "../../__mocks__/mock";
import * as orchUtils from "../../utils/orchestrators";
import { getUpdateExpiredCgnHandler } from "../handler";
import * as tableUtils from "../table";

const activationAndExpirationDates = {
  activationDate: cgnActivatedDates.activation_date,
  expirationDate: cgnActivatedDates.expiration_date
};
// tslint:disable-next-line: readonly-array
const aSetOfExpiredRows: tableUtils.ExpiredCgnRowKeyType[] = [
  {
    fiscalCode: "RODFDS82S10H501T" as FiscalCode,
    ...activationAndExpirationDates
  },
  {
    fiscalCode: "RODEDS80S10H501T" as FiscalCode,
    ...activationAndExpirationDates
  }
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
  .spyOn(orchUtils, "terminateUpdateCgnOrchestratorTask")
  .mockImplementation(terminateOrchestratorMock);
describe("UpdateExpiredCgn", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should process all fiscalCodes present on table", async () => {
    getExpiredCgnUsersMock.mockImplementationOnce(() =>
      taskEither.of(aSetOfExpiredRows)
    );
    const updateExpiredCgnHandler = getUpdateExpiredCgnHandler(
      tableServiceMock as any,
      expiredCgnTableName
    );
    await updateExpiredCgnHandler(context);
    expect(mockStartNew).toBeCalledTimes(aSetOfExpiredRows.length);
  });

  it("should terminate other orchestrators running for activation and revocation", async () => {
    getExpiredCgnUsersMock.mockImplementationOnce(() =>
      taskEither.of(aSetOfExpiredRows)
    );
    const updateExpiredCgnHandler = getUpdateExpiredCgnHandler(
      tableServiceMock as any,
      expiredCgnTableName
    );
    await updateExpiredCgnHandler(context);
    expect(terminateOrchestratorMock).toBeCalledTimes(
      aSetOfExpiredRows.length * 2
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
  it("should not instantiate some orchestrator if there are errors terminating other instances for a certain fiscalCode", async () => {
    getExpiredCgnUsersMock.mockImplementationOnce(() =>
      taskEither.of(aSetOfExpiredRows)
    );
    terminateOrchestratorMock.mockImplementationOnce(() =>
      fromLeft(new Error("Error"))
    );
    const updateExpiredCgnHandler = getUpdateExpiredCgnHandler(
      tableServiceMock as any,
      expiredCgnTableName
    );
    await updateExpiredCgnHandler(context);
    expect(mockStartNew).toBeCalledTimes(aSetOfExpiredRows.length - 1);
  });
});
