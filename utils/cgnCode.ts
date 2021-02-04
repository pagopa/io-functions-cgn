import { randomBytes } from "crypto";
import { promisify } from "util";

import { isLeft } from "fp-ts/lib/Either";
import { NonEmptyString } from "italia-ts-commons/lib/strings";

// Note that we redeclare the alphabet and the length of the CGN here as a
// double assurance that the implementation is correct and things will break
// in case the definition gets changed in one place only.

// CGN codes are made of characters picked from the following alphabet
export const ALPHABET = "ABCDEFGHILMNOPQRSTUVZ123456789";
const ALPHABET_LEN = ALPHABET.length;

// CGN codes have a length of 12 characthers
export const BONUSCODE_LENGTH = 12;

const asyncRandomBytes = promisify(randomBytes);

/**
 * Generates a new random CGN code
 */
export async function genRandomCgnCode(
  getAsyncRandomBytes: typeof asyncRandomBytes = asyncRandomBytes
): Promise<NonEmptyString> {
  const randomBuffer = await getAsyncRandomBytes(BONUSCODE_LENGTH);
  const code = [...randomBuffer].map(b => ALPHABET[b % ALPHABET_LEN]).join("");
  const cgnCode = NonEmptyString.decode(code);
  if (isLeft(cgnCode)) {
    // this should never happen
    throw Error(`FATAL: genRandomCgnCode generated invalid CGN code [${code}]`);
  }
  return cgnCode.value;
}
