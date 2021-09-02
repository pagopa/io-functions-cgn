/* tslint:disable: no-any */
import { ExponentialRetryPolicyFilter } from "azure-storage";
import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { context, mockStartNew } from "../../__mocks__/durable-functions";
import { cgnActivatedDates } from "../../__mocks__/mock";
import * as aInsights from "../../utils/appinsights";
import * as expirationUtils from "../../utils/card_expiration";
import * as orchUtils from "../../utils/orchestrators";
import { getUpdateExpiredCgnHandler } from "../handler";

const activationAndExpirationDates = {
  activationDate: cgnActivatedDates.activation_date,
  expirationDate: cgnActivatedDates.expiration_date
};
// tslint:disable-next-line: readonly-array
const aSetOfExpiredRows: expirationUtils.ExpiredCardRowKey[] = [
  {
    fiscalCode: "RODFDS82S10H501T" as FiscalCode,
    ...activationAndExpirationDates
  },
  {
    fiscalCode: "RODEDS80S10H501T" as FiscalCode,
    ...activationAndExpirationDates
  }
];
const aTableServiceFilter = new ExponentialRetryPolicyFilter(5);
const withFilterMock = jest.fn();
const tableServiceMock = {
  withFilter: withFilterMock
};
const expiredCgnTableName = "aTable" as NonEmptyString;

const getExpiredCgnUsersMock = jest.fn();
jest
  .spyOn(expirationUtils, "getExpiredCardUsers")
  .mockImplementation(getExpiredCgnUsersMock);

const terminateOrchestratorMock = jest
  .fn()
  .mockImplementation(() => taskEither.of(void 0));
jest
  .spyOn(orchUtils, "terminateUpdateCgnOrchestratorTask")
  .mockImplementation(terminateOrchestratorMock);

const trackExceptionMock = jest.fn(_ => void 0);
jest.spyOn(aInsights, "trackException").mockImplementation(trackExceptionMock);
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
    expect(withFilterMock).toHaveBeenCalledWith(aTableServiceFilter);
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
    expect(withFilterMock).toHaveBeenCalledWith(aTableServiceFilter);
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
    expect(withFilterMock).toHaveBeenCalledWith(aTableServiceFilter);
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
    expect(withFilterMock).toHaveBeenCalledWith(aTableServiceFilter);
    expect(mockStartNew).not.toHaveBeenCalled();
    expect(trackExceptionMock).toHaveBeenCalledTimes(1);
    expect(trackExceptionMock).toHaveBeenCalledWith({
      exception: expect.anything(),
      properties: {
        id: expect.anything(),
        name: "cgn.expiration.error"
      },
      tagOverrides: { samplingEnabled: "false" }
    });
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
    expect(withFilterMock).toHaveBeenCalledWith(aTableServiceFilter);
    expect(mockStartNew).toBeCalledTimes(aSetOfExpiredRows.length - 1);
    expect(trackExceptionMock).toHaveBeenCalledTimes(1);
    expect(trackExceptionMock).toHaveBeenCalledWith({
      exception: expect.anything(),
      properties: {
        id: "RODFDS82S10H501T",
        name: "cgn.expiration.error"
      },
      tagOverrides: { samplingEnabled: "false" }
    });
  });
});
