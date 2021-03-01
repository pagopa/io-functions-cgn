import { context, mockStartNew } from "../../__mocks__/durable-functions";
import { aFiscalCode } from "../../__mocks__/mock";
import ContinueEycaActivationHandler from "../index";
import * as cgn_checks from "../../utils/cgn_checks";
import { left, right } from "fp-ts/lib/Either";
import { addYears } from "date-fns";

const extractEycaExpirationDateMock = jest
  .spyOn(cgn_checks, "extractEycaExpirationDate")
  .mockImplementation(() => right(addYears(new Date(), 5)));

describe("ContinueEycaActivation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return a permanent error if input cannot be decoded", async () => {
    const result = ContinueEycaActivationHandler(context, {});
    return expect(result).resolves.toMatchObject({ kind: "PERMANENT" });
  });

  it("should return an Internal Error if it is not possible to calculate Expiration Date from FiscalCode", async () => {
    extractEycaExpirationDateMock.mockImplementationOnce(() =>
      left(new Error("Cannot extract date"))
    );
    const result = ContinueEycaActivationHandler(context, {
      fiscalCode: aFiscalCode
    });
    return expect(result).resolves.toMatchObject({ kind: "PERMANENT" });
  });

  it("should return a transient error if the orchestrator throws", async () => {
    mockStartNew.mockImplementationOnce(async () => {
      throw new Error("foobar");
    });
    try {
      await ContinueEycaActivationHandler(context, {
        fiscalCode: aFiscalCode
      });
      fail();
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).message).toContain("foobar");
    }
  });
});
