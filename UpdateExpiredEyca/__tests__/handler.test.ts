/* tslint:disable: no-any */
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { ExponentialRetryPolicyFilter } from "azure-storage";
import * as TE from "fp-ts/lib/TaskEither";
import { context, mockStartNew } from "../../__mocks__/durable-functions";
import { cgnActivatedDates } from "../../__mocks__/mock";
import * as aInsights from "../../utils/appinsights";
import * as tableUtils from "../../utils/card_expiration";
import * as orchUtils from "../../utils/orchestrators";
import { getUpdateExpiredEycaHandler } from "../handler";

const activationAndExpirationDates = {
  activationDate: cgnActivatedDates.activation_date,
  expirationDate: cgnActivatedDates.expiration_date
};
// tslint:disable-next-line: readonly-array
const aSetOfExpiredRows: tableUtils.ExpiredCardRowKey[] = [
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

const expiredEycaTableName = "aTable" as NonEmptyString;

const getExpiredEycaUsersMock = jest.fn();
jest
  .spyOn(tableUtils, "getExpiredCardUsers")
  .mockImplementation(getExpiredEycaUsersMock);

const trackExceptionMock = jest.fn(_ => void 0);
jest.spyOn(aInsights, "trackException").mockImplementation(trackExceptionMock);

const terminateOrchestratorMock = jest
  .fn()
  .mockImplementation(() => TE.of(void 0));
jest
  .spyOn(orchUtils, "terminateOrchestratorById")
  .mockImplementation(terminateOrchestratorMock);
describe("UpdateExpiredCgn", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should process all fiscalCodes present on table", async () => {
    getExpiredEycaUsersMock.mockImplementationOnce(() =>
      TE.of(aSetOfExpiredRows)
    );
    const updateExpiredEycaHandler = getUpdateExpiredEycaHandler(
      tableServiceMock as any,
      expiredEycaTableName
    );
    await updateExpiredEycaHandler(context);
    expect(withFilterMock).toHaveBeenCalledWith(aTableServiceFilter);
    expect(mockStartNew).toBeCalledTimes(aSetOfExpiredRows.length);
  });

  it("should terminate other orchestrators running for activation", async () => {
    getExpiredEycaUsersMock.mockImplementationOnce(() =>
      TE.of(aSetOfExpiredRows)
    );
    const updateExpiredEycaHandler = getUpdateExpiredEycaHandler(
      tableServiceMock as any,
      expiredEycaTableName
    );
    await updateExpiredEycaHandler(context);
    expect(withFilterMock).toHaveBeenCalledWith(aTableServiceFilter);
    expect(terminateOrchestratorMock).toBeCalledTimes(aSetOfExpiredRows.length);
  });

  it("should not instantiate any orchestrator if there are no elements to process", async () => {
    getExpiredEycaUsersMock.mockImplementationOnce(() => TE.of([]));
    const updateExpiredEycaHandler = getUpdateExpiredEycaHandler(
      tableServiceMock as any,
      expiredEycaTableName
    );
    await updateExpiredEycaHandler(context);
    expect(withFilterMock).toHaveBeenCalledWith(aTableServiceFilter);
    expect(mockStartNew).not.toHaveBeenCalled();
  });

  it("should not instantiate any orchestrator if there are errors querying table", async () => {
    getExpiredEycaUsersMock.mockImplementationOnce(() =>
      TE.left(new Error("Cannot query table"))
    );
    const updateExpiredEycaHandler = getUpdateExpiredEycaHandler(
      tableServiceMock as any,
      expiredEycaTableName
    );
    await updateExpiredEycaHandler(context);
    expect(withFilterMock).toHaveBeenCalledWith(aTableServiceFilter);
    expect(mockStartNew).not.toHaveBeenCalled();
    expect(trackExceptionMock).toHaveBeenCalledWith({
      exception: expect.anything(),
      properties: {
        id: expect.anything(),
        name: "eyca.expiration.error"
      },
      tagOverrides: { samplingEnabled: "false" }
    });
  });
  it("should not instantiate some orchestrator if there are errors terminating other instances for a certain fiscalCode", async () => {
    getExpiredEycaUsersMock.mockImplementationOnce(() =>
      TE.of(aSetOfExpiredRows)
    );
    terminateOrchestratorMock.mockImplementationOnce(() =>
      TE.left(new Error("Error"))
    );
    const updateExpiredEycaHandler = getUpdateExpiredEycaHandler(
      tableServiceMock as any,
      expiredEycaTableName
    );
    await updateExpiredEycaHandler(context);
    expect(withFilterMock).toHaveBeenCalledWith(aTableServiceFilter);
    expect(mockStartNew).toBeCalledTimes(aSetOfExpiredRows.length - 1);
    expect(trackExceptionMock).toHaveBeenCalledTimes(1);
    expect(trackExceptionMock).toHaveBeenCalledWith({
      exception: expect.anything(),
      properties: {
        id: "RODFDS82S10H501T",
        name: "eyca.expiration.error"
      },
      tagOverrides: { samplingEnabled: "false" }
    });
  });
});
