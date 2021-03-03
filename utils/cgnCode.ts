import { randomBytes } from "crypto";
import { promisify } from "util";

import { isLeft } from "fp-ts/lib/Either";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { OtpCode } from "../generated/definitions/OtpCode";

// Note that we redeclare the alphabet and the length of the CGN here as a
// double assurance that the implementation is correct and things will break
// in case the definition gets changed in one place only.

// Youth Card codes are made of characters picked from the following alphabet
export const ALPHABET = "ABCDEFGHILMNOPQRSTUVZ123456789";
const ALPHABET_LEN = ALPHABET.length;

export const OTP_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const OTP_ALPHABET_LEN = OTP_ALPHABET.length;

// Youth Card codes have a length of 16 characthers
export const BONUSCODE_LENGTH = 16;

export const OTPCODE_LENGTH = 11;

const asyncRandomBytes = promisify(randomBytes);

/**
 * Generates a new random Card code
 */
export async function genRandomCardCode(
  getAsyncRandomBytes: typeof asyncRandomBytes = asyncRandomBytes
): Promise<NonEmptyString> {
  const randomBuffer = await getAsyncRandomBytes(BONUSCODE_LENGTH);
  const code = [...randomBuffer].map(b => ALPHABET[b % ALPHABET_LEN]).join("");
  const cardCode = NonEmptyString.decode(code);
  if (isLeft(cardCode)) {
    // this should never happen
    throw Error(
      `FATAL: genRandomCardCode generated invalid Youth Card code [${code}]`
    );
  }
  return cardCode.value;
}

/**
 * Generates a new random OTP code
 */
export async function generateOtpCode(
  getAsyncRandomBytes: typeof asyncRandomBytes = asyncRandomBytes
): Promise<OtpCode> {
  const randomBuffer = await getAsyncRandomBytes(OTPCODE_LENGTH);
  const code = [...randomBuffer]
    .map(b => OTP_ALPHABET[b % OTP_ALPHABET_LEN])
    .join("");
  const otpCode = OtpCode.decode(code);
  if (isLeft(otpCode)) {
    // this should never happen
    throw Error(`FATAL: generateOtpCode generated invalid OTP code [${code}]`);
  }
  return otpCode.value;
}
