import { Context } from "@azure/functions";
import { IResponseType } from "@pagopa/ts-commons/lib/requests";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import * as E from "fp-ts/lib/Either";
import { flow, pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { ServicesAPIClient } from "../clients/services";
import { Activation } from "../generated/services-api/Activation";
import { ActivationStatus } from "../generated/services-api/ActivationStatus";
import { ActivityResult, failure, success } from "../utils/activity";
import { errorsToError } from "../utils/conversions";

export const ActivityInput = t.interface({
  activationStatus: ActivationStatus,
  fiscalCode: FiscalCode
});

export type ActivityInput = t.TypeOf<typeof ActivityInput>;

const isUpsertServiceActivationSuccess = (
  res: IResponseType<number, unknown, never>
): res is IResponseType<200, Activation, never> => res.status === 200;

const upsertServiceActivation = (
  servicesClient: ServicesAPIClient,
  activationStatus: ActivationStatus,
  fiscalCode: FiscalCode
): TE.TaskEither<Error, Activation> =>
  pipe(
    TE.tryCatch(
      () =>
        servicesClient.upsertServiceActivation({
          payload: { fiscal_code: fiscalCode, status: activationStatus }
        }),
      E.toError
    ),
    TE.chain(flow(TE.fromEither, TE.mapLeft(errorsToError))),
    TE.chain(
      TE.fromPredicate(
        isUpsertServiceActivationSuccess,
        _ =>
          new Error(
            `Cannot upsert service activation with response code ${_.status}`
          )
      )
    ),
    TE.map(successResponse => successResponse.value)
  );

export const getUpsertSpecialServiceActivationActivityHandler = (
  servicesClient: ServicesAPIClient,
  logPrefix: string = "UpsertSpecialServiceActivationActivity"
) => (context: Context, input: unknown): Promise<ActivityResult> => {
  const fail = failure(context, logPrefix);
  return pipe(
    input,
    ActivityInput.decode,
    TE.fromEither,
    TE.mapLeft(errs =>
      fail(errorsToError(errs), "Cannot decode Activity Input")
    ),
    TE.chain(activityInput =>
      pipe(
        upsertServiceActivation(
          servicesClient,
          activityInput.activationStatus,
          activityInput.fiscalCode
        ),
        TE.bimap(
          err => fail(err, "Cannot upsert special service activation"),
          () => success()
        )
      )
    ),
    TE.toUnion
  )();
};
