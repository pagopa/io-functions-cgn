import { Context } from "@azure/functions";
import { toError } from "fp-ts/lib/Either";
import { identity } from "fp-ts/lib/function";
import { fromEither } from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import { StatusEnum } from "../generated/definitions/CardPending";
import { UserEycaCardModel } from "../models/user_eyca_card";
import { ActivityResult, failure, success } from "../utils/activity";
import { errorsToError } from "../utils/conversions";
import { EnqueueEycaActivationT } from "../utils/models";

export const ActivityInput = t.interface({
  fiscalCode: FiscalCode
});

export type ActivityInput = t.TypeOf<typeof ActivityInput>;

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
          card: { status: StatusEnum.PENDING },
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
