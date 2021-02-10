import { addYears } from "date-fns";
import { FiscalCode } from "italia-ts-commons/lib/strings";

export const now = new Date();

export const cgnActivatedDates = {
  activation_date: now,
  expiration_date: addYears(now, 2)
};

export const aFiscalCode = "DNLLSS99S20H501F" as FiscalCode;
