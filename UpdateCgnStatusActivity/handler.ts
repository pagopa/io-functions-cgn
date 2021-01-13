import { Context } from "@azure/functions";
import { fromOption, toError } from "fp-ts/lib/Either";
import { identity } from "fp-ts/lib/function";
import { fromEither } from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import { CgnStatus } from "../generated/definitions/CgnStatus";
import { UserCgnModel } from "../models/user_cgn";
import { errorsToError } from "../utils/conversions";

export const ActivityInput = t.interface({
  cgnStatus: CgnStatus,
  fiscalCode: FiscalCode
});

export type ActivityInput = t.TypeOf<typeof ActivityInput>;

// Activity result
const ActivityResultSuccess = t.interface({
  kind: t.literal("SUCCESS")
});

type ActivityResultSuccess = t.TypeOf<typeof ActivityResultSuccess>;

const ActivityResultFailure = t.interface({
  kind: t.literal("FAILURE"),
  reason: t.string
});

type ActivityResultFailure = t.TypeOf<typeof ActivityResultFailure>;

export const ActivityResult = t.taggedUnion("kind", [
  ActivityResultSuccess,
  ActivityResultFailure
]);

export type ActivityResult = t.TypeOf<typeof ActivityResult>;

const failure = (context: Context, logPrefix: string) => (
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

const success = () =>
  ActivityResultSuccess.encode({
    kind: "SUCCESS"
  });

export const getUpdateCgnStatusActivityHandler = (
  userCgnModel: UserCgnModel,
  logPrefix: string = "UpdateCgnStatusActivity"
) => (context: Context, input: unknown): Promise<ActivityResult> => {
  const fail = failure(context, logPrefix);
  return fromEither(ActivityInput.decode(input))
    .mapLeft(errs => fail(errorsToError(errs), "Cannot decode Activity Input"))
    .chain(activityInput =>
      userCgnModel
        .findLastVersionByModelId([activityInput.fiscalCode])
        .mapLeft(() =>
          fail(new Error("Cannot retrieve userCgn for the provided fiscalCode"))
        )
        .chain(maybeUserCgn =>
          fromEither(
            fromOption(
              fail(new Error("No userCgn found for the provided fiscalCode"))
            )(maybeUserCgn)
          )
        )
        .map(userCgn => ({
          ...userCgn,
          status: activityInput.cgnStatus
        }))
    )
    .chain(_ =>
      userCgnModel.update(_).bimap(
        err => fail(toError(err), "Cannot update userCgn"),
        () => success()
      )
    )
    .fold<ActivityResult>(identity, identity)
    .run();
};
