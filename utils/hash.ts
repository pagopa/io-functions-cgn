import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as crypto from "crypto";

export const toHash = (s: string): NonEmptyString => {
  const hash = crypto.createHash("sha256");
  hash.update(s);
  return hash.digest("hex") as NonEmptyString;
};
