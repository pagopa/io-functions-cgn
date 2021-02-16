import { Context } from "@azure/functions";
import * as t from "io-ts";

// Activity result
export const ActivityResultSuccess = t.interface({
  kind: t.literal("SUCCESS")
});

export type ActivityResultSuccess = t.TypeOf<typeof ActivityResultSuccess>;

export const ActivityResultFailure = t.interface({
  kind: t.literal("FAILURE"),
  reason: t.string
});

export type ActivityResultFailure = t.TypeOf<typeof ActivityResultFailure>;

export const ActivityResult = t.taggedUnion("kind", [
  ActivityResultSuccess,
  ActivityResultFailure
]);

export type ActivityResult = t.TypeOf<typeof ActivityResult>;

export const failure = (context: Context, logPrefix: string) => (
  err: Error,
  description: string = ""
) => {
  const logMessage =
    description === ""
      ? `${logPrefix}|FAILURE=${err.message}`
      : `${logPrefix}|${description}|FAILURE=${err.message}`;
  context.log.info(logMessage);
  return ActivityResultFailure.encode({
    kind: "FAILURE",
    reason: err.message
  });
};

export const success = () =>
  ActivityResultSuccess.encode({
    kind: "SUCCESS"
  });
