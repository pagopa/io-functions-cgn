import { Context } from "@azure/functions";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { toError } from "fp-ts/lib/Either";
import { flow, pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { StatusEnum } from "../generated/definitions/CardPending";
import { UserEycaCardModel } from "../models/user_eyca_card";
import { ActivityResult, success } from "../utils/activity";
import { errorsToError } from "../utils/conversions";
import {
  toPermanentFailure,
  toTransientFailure,
  trackFailure
} from "../utils/errors";
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
  const fail = trackFailure(context, logPrefix);
  return pipe(
    input,
    ActivityInput.decode,
    TE.fromEither,
    TE.mapLeft(
      flow(errorsToError, e =>
        toPermanentFailure(e, "Cannot decode activity input")
      )
    ),
    TE.chain(({ fiscalCode }) =>
      pipe(
        userEycaCardModel.upsert({
          card: { status: StatusEnum.PENDING },
          fiscalCode,
          kind: "INewUserEycaCard"
        }),
        TE.mapLeft(
          flow(toError, e =>
            toTransientFailure(e, "Cannot insert EYCA Pending status")
          )
        ),
        TE.chain(() =>
          pipe(
            enqueueEycaActivation({ fiscalCode }),
            TE.mapLeft(err =>
              toTransientFailure(err, "Cannot enqueue EYCA activation")
            )
          )
        )
      )
    ),
    TE.bimap(fail, success),
    TE.toUnion
  )();
};
