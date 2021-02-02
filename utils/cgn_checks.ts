import { addYears, isAfter } from "date-fns";
import { Option, tryCatch } from "fp-ts/lib/Option";
import { fromLeft } from "fp-ts/lib/TaskEither";
import { taskEither } from "fp-ts/lib/TaskEither";
import { FiscalCode } from "italia-ts-commons/lib/strings";

/**
 * Returns a comparator of two dates that returns true if
 * the difference in years is at least the provided value.
 */
export const isOlderThan = (years: number) => (
  dateOfBirth: Date,
  when: Date
) => {
  return !isAfter(addYears(dateOfBirth, years), when);
};

/**
 * Returns a comparator of two dates that returns true if
 * the difference in years is at most the provided value.
 */
export const isYoungerThan = (years: number) => (
  dateOfBirth: Date,
  when: Date
) => {
  return isAfter(addYears(dateOfBirth, years), when);
};

export const isValidDate = (d: Date) => {
  return d instanceof Date && !isNaN(d.getTime());
};

const months: { [k: string]: number } = {
  ["A"]: 1,
  ["B"]: 2,
  ["C"]: 3,
  ["D"]: 4,
  ["E"]: 5,
  ["H"]: 6,
  ["L"]: 7,
  ["M"]: 8,
  ["P"]: 9,
  ["R"]: 10,
  ["S"]: 11,
  ["T"]: 12
};

export const toBirthDate = (fiscalCode: FiscalCode): Option<Date> => {
  return tryCatch(() => {
    const tempDay = parseInt(fiscalCode.substring(9, 11), 10);
    if (isNaN(tempDay)) {
      throw new Error();
    }

    const monthIndx = fiscalCode.charAt(8);
    if (!(monthIndx in months)) {
      throw new Error();
    }

    const month = months[fiscalCode.charAt(8)];

    // female subjects have 40 added to their birth day
    const day = tempDay - 40 > 0 ? tempDay - 40 : tempDay;

    const tempYear = parseInt(fiscalCode.substring(6, 8), 10);
    if (isNaN(tempYear)) {
      throw new Error();
    }

    // to avoid the century date collision (01 could mean 1901 or 2001)
    // we assume that if the birth date is grater than a century, the date
    // refers to the new century
    const year =
      tempYear +
      (new Date().getFullYear() - (1900 + tempYear) >= 100 ? 2000 : 1900);

    // months are 0-index
    const birthDay = new Date(year, month - 1, day);
    if (!isValidDate(birthDay)) {
      throw new Error();
    }

    return birthDay;
  });
};

export const extractCgnExpirationDate = (fiscalCode: FiscalCode) =>
  taskEither
    .of<Error, FiscalCode>(fiscalCode)
    .map(_ => toBirthDate(_))
    .chain(maybeBirthDate =>
      maybeBirthDate.foldL(
        () =>
          fromLeft<Error, Date>(
            new Error("Cannot extract birth date from given fiscalCode")
          ),
        birthDate => taskEither.of<Error, Date>(birthDate)
      )
    )
    .chain(birthDate => taskEither.of(addYears(birthDate, 36)));

export const checkCgnRequirements = (fiscalCode: FiscalCode) =>
  taskEither
    .of<Error, FiscalCode>(fiscalCode)
    .map(_ => toBirthDate(_))
    .chain(maybeBirthDate =>
      maybeBirthDate.foldL(
        () =>
          fromLeft<Error, Date>(
            new Error("Cannot extract birth date from given fiscalCode")
          ),
        birthDate => taskEither.of<Error, Date>(birthDate)
      )
    )
    .chain(birthDate =>
      taskEither.of(
        isOlderThan(18)(birthDate, new Date()) &&
          isYoungerThan(36)(birthDate, new Date())
      )
    );
