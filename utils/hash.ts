import * as crypto from "crypto";
import { NonEmptyString } from "italia-ts-commons/lib/strings";

export const toHash = (s: string): NonEmptyString => {
  const hash = crypto.createHash("sha256");
  hash.update(s);
  return hash.digest("hex") as NonEmptyString;
};
