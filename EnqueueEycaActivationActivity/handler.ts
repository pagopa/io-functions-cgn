import { Context } from "@azure/functions";
import { toError } from "fp-ts/lib/Either";
import { identity } from "fp-ts/lib/function";
import { fromEither } from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import { StatusEnum } from "../generated/definitions/CardPendingStatus";
import { UserEycaCardModel } from "../models/user_eyca_card";
import { errorsToError } from "../utils/conversions";
import { EnqueueEycaActivationT } from "../utils/models";

export const ActivityInput = t.interface({
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

export const getEnqueueEycaActivationActivityHandler = (
  userEycaCardModel: UserEycaCardModel,
  enqueueEycaActivation: EnqueueEycaActivationT,
  logPrefix: string = "EnqueueEycaActivationActivity"
) => (context: Context, input: unknown): Promise<ActivityResult> => {
  const fail = failure(context, logPrefix);

  return fromEither(ActivityInput.decode(input))
    .mapLeft(errs => fail(errorsToError(errs), "Cannot decode Activity Input"))
    .chain(({ fiscalCode }) =>
      // we try to insert a pending Eyca card before the async
      // activation process starts
      userEycaCardModel
        .upsert({
          cardStatus: { status: StatusEnum.PENDING },
          fiscalCode,
          kind: "INewUserEycaCard"
        })

        .mapLeft(err => fail(toError(err), "Cannot insert EYCA Pending status"))
        .chain(() =>
          enqueueEycaActivation({ fiscalCode }).mapLeft(err =>
            fail(err, "Cannot enqueue EYCA activation")
          )
        )
    )
    .map(success)
    .fold<ActivityResult>(identity, identity)
    .run();
};
