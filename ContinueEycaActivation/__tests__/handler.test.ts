import { context, mockStartNew } from "../../__mocks__/durable-functions";
import { aFiscalCode } from "../../__mocks__/mock";
import ContinueEycaActivationHandler from "../index";

describe("ContinueEycaActivation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return a permanent error if input cannot be decoded", async () => {
    const result = ContinueEycaActivationHandler(context, {});
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
