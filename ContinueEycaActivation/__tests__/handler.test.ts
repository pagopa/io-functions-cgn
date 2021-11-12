import { addYears } from "date-fns";
import * as E from "fp-ts/lib/Either";
import { context, mockStartNew } from "../../__mocks__/durable-functions";
import { aFiscalCode } from "../../__mocks__/mock";
import * as cgn_checks from "../../utils/cgn_checks";
import { DEFAULT_EYCA_UPPER_BOUND_AGE } from "../../utils/config";
import { ContinueEycaActivationHandler } from "../handler";

const extractEycaExpirationDateMock = jest
  .spyOn(cgn_checks, "extractEycaExpirationDate")
  .mockImplementation(() => E.right(addYears(new Date(), 5)));

describe("ContinueEycaActivation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return a permanent error if input cannot be decoded", async () => {
    const result = ContinueEycaActivationHandler(
      context,
      {},
      DEFAULT_EYCA_UPPER_BOUND_AGE
    );
    return expect(result).resolves.toMatchObject({ kind: "PERMANENT" });
  });

  it("should return an Internal Error if it is not possible to calculate Expiration Date from FiscalCode", async () => {
    extractEycaExpirationDateMock.mockImplementationOnce(() =>
      E.left(new Error("Cannot extract date"))
    );
    const result = ContinueEycaActivationHandler(
      context,
      {
        fiscalCode: aFiscalCode
      },
      DEFAULT_EYCA_UPPER_BOUND_AGE
    );
    return expect(result).resolves.toMatchObject({ kind: "PERMANENT" });
  });

  it("should return a transient error if the orchestrator throws", async () => {
    mockStartNew.mockImplementationOnce(async () => {
      throw new Error("foobar");
    });
    try {
      await ContinueEycaActivationHandler(
        context,
        {
          fiscalCode: aFiscalCode
        },
        DEFAULT_EYCA_UPPER_BOUND_AGE
      );
      fail();
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).message).toContain("foobar");
    }
  });
});
