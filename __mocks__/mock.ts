import { addYears } from "date-fns";

export const now = new Date();

export const cgnActivatedDates = {
  activation_date: now,
  expiration_date: addYears(now, 2)
};
