import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { addYears } from "date-fns";

export const now = new Date();

export const cgnActivatedDates = {
  activation_date: now,
  expiration_date: addYears(now, 2)
};

export const aFiscalCode = "DNLLSS99S20H501F" as FiscalCode;

export const testFail = () => fail("Unexpected Value");
