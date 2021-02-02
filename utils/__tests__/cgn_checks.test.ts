import * as date_fns from "date-fns";
import { isLeft, isRight } from "fp-ts/lib/Either";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import { checkCgnRequirements, extractCgnExpirationDate } from "../cgn_checks";

const anElibibleFiscalCode = "DROLSS85S20H501F" as FiscalCode;
const anUnElibibleFiscalCode = "DROLSS84S20H501F" as FiscalCode;
const aWrongFiscalCode = "AAAAAADSB00H000F" as FiscalCode;
describe("checkCgnRequirements", () => {
  it("should return an Error if there is an error extracting birthDate from FiscalCode", async () => {
    const result = await checkCgnRequirements(aWrongFiscalCode).run();
    expect(isLeft(result)).toBeTruthy();
  });

  it("should return true if the given fiscalCode is eligible for CGN", async () => {
    const result = await checkCgnRequirements(anElibibleFiscalCode).run();
    const isRightResult = isRight(result);
    expect(isRightResult).toBeTruthy();
    if (isRightResult) {
      expect(result.value).toEqual(true);
    }
  });

  it("should return false if the given fiscalCode is not eligible for CGN", async () => {
    const result = await checkCgnRequirements(anUnElibibleFiscalCode).run();
    const isRightResult = isRight(result);
    expect(isRightResult).toBeTruthy();
    if (isRightResult) {
      expect(result.value).toEqual(false);
    }
  });
});
describe("extractCgnExpirationDate", () => {
  it("should return an Error if there is an error extracting birthDate from FiscalCode", async () => {
    const result = await checkCgnRequirements(aWrongFiscalCode).run();
    expect(isLeft(result)).toBeTruthy();
  });

  it("should return an expiration Date", async () => {
    const result = await extractCgnExpirationDate(anElibibleFiscalCode).run();
    expect(isRight(result)).toBeTruthy();
    if (isRight(result)) {
      expect(date_fns.format(result.value, "yyyy-MM-dd")).toEqual("2021-11-20");
    }
  });
});
