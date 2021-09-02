import { Context } from "@azure/functions";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { toError } from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
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
  return pipe(
    input,
    ActivityInput.decode,
    TE.fromEither,
    TE.mapLeft(errs =>
      fail(errorsToError(errs), "Cannot decode Activity Input")
    ),
    TE.chain(({ fiscalCode }) =>
      pipe(
        userEycaCardModel.upsert({
          card: { status: StatusEnum.PENDING },
          fiscalCode,
          kind: "INewUserEycaCard"
        }),
        TE.mapLeft(err =>
          fail(toError(err), "Cannot insert EYCA Pending status")
        ),
        TE.chain(() =>
          pipe(
            enqueueEycaActivation({ fiscalCode }),
            TE.mapLeft(err => fail(err, "Cannot enqueue EYCA activation"))
          )
        )
      )
    ),
    TE.map(success),
    TE.toUnion
  )();
};
