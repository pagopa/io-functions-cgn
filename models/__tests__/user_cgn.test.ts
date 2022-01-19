import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { UserCgnModel } from "../user_cgn";

const aFiscalCode = "RODFDS89S10H501T" as FiscalCode;
const aDocumentId = "aDocumentId" as NonEmptyString;
const createMockIterator = <T, TReturn = any>(
  items: readonly T[],
  lastValue?: TReturn
): AsyncIterator<T> => {
  // eslint-disable-next-line functional/prefer-readonly-type
  const data: T[] = [...items];
  const result = (value: T): IteratorYieldResult<T> => ({
    done: false,
    value
  });
  const finish = (): IteratorReturnResult<typeof lastValue> => ({
    done: true,
    value: lastValue
  });
  return {
    next: jest.fn(async () => {
      const item = data.shift();
      return data.length + 1 && item ? result(item) : finish();
    })
  };
};

const deleteMock = jest
  .fn()
  .mockImplementation(() => Promise.resolve({ item: { id: aDocumentId } }));
const getAsyncIteratorMock = jest.fn().mockImplementation(() => ({
  [Symbol.asyncIterator]: jest
    .fn()
    .mockImplementation(() => createMockIterator([""]))
}));
const containerMock = {
  item: jest.fn().mockImplementation(() => ({
    delete: deleteMock
  })),
  items: {
    query: jest.fn().mockImplementation(() => ({
      getAsyncIterator: getAsyncIteratorMock
    }))
  }
};
afterEach(() => {
  jest.clearAllMocks();
});

describe("findAll", () => {
  it("should not throw", async () => {
    const userCgnModel = new UserCgnModel(containerMock as any);
    const result = await userCgnModel.findAllCgnCards(aFiscalCode)();
    expect(result).toBeDefined();
  });
});

describe("delete", () => {
  it("should not throw", async () => {
    const userCgnModel = new UserCgnModel(containerMock as any);
    const result = await userCgnModel.deleteVersion(aFiscalCode, aDocumentId)();
    expect(result).toBeDefined();
  });
});
