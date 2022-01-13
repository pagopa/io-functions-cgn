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
import { ActivityResultSuccess, success } from "../utils/activity";
import { trackException } from "../utils/appinsights";
import { errorsToError } from "../utils/conversions";
import { Failure, TransientFailure, PermanentFailure } from "../utils/errors";

export const ActivityInput = t.interface({
  activationStatus: ActivationStatus,
  fiscalCode: FiscalCode
});

export type ActivityInput = t.TypeOf<typeof ActivityInput>;

const isUpsertServiceActivationSuccess = (
  res: IResponseType<number, unknown, never>
): res is IResponseType<200, Activation, never> => res.status === 200;

const permanentFailure = (err: Error): Failure =>
  Failure.encode({
    kind: "PERMANENT",
    reason: `PERMANENT FAILURE|ERROR=${err.message}`
  });

const transientFailure = (err: Error): Failure =>
  Failure.encode({
    kind: "TRANSIENT",
    reason: `TRANSIENT FAILURE|ERROR=${err.message}`
  });

const mapUpsertServiceActivationFailure = (
  res: IResponseType<number, unknown, never>
): Failure => {
  const error = new Error(
    `Cannot upsert service activation with response code ${res.status}`
  );
  return [429, 500].includes(res.status)
    ? transientFailure(error)
    : permanentFailure(error);
};

const upsertServiceActivation = (
  servicesClient: ServicesAPIClient,
  activationStatus: ActivationStatus,
  fiscalCode: FiscalCode
): TE.TaskEither<Failure, Activation> =>
  pipe(
    TE.tryCatch(
      () =>
        servicesClient.upsertServiceActivation({
          payload: { fiscal_code: fiscalCode, status: activationStatus }
        }),
      flow(E.toError, transientFailure)
    ),
    TE.chain(
      flow(TE.fromEither, TE.mapLeft(flow(errorsToError, transientFailure)))
    ),
    TE.chainW(
      TE.fromPredicate(
        isUpsertServiceActivationSuccess,
        mapUpsertServiceActivationFailure
      )
    ),
    TE.map(successResponse => successResponse.value)
  );

export const getUpsertSpecialServiceActivationActivityHandler = (
  servicesClient: ServicesAPIClient,
  logPrefix: string = "UpsertSpecialServiceActivationActivity"
) => (
  context: Context,
  input: unknown
): Promise<Failure | ActivityResultSuccess> =>
  pipe(
    input,
    ActivityInput.decode,
    TE.fromEither,
    TE.mapLeft(flow(errorsToError, permanentFailure)),
    TE.chain(activityInput =>
      upsertServiceActivation(
        servicesClient,
        activityInput.activationStatus,
        activityInput.fiscalCode
      )
    ),
    TE.bimap(
      err => {
        const error = TransientFailure.is(err)
          ? `${logPrefix}|TRANSIENT_ERROR=${err.reason}`
          : `${logPrefix}|FATAL|PERMANENT_ERROR=${err.reason}`;
        trackException({
          exception: new Error(error),
          properties: {
            // In case the the input (message from queue) cannot be decoded
            // we mark this as a FATAL error since the lock on user's family won't be relased
            detail: err.kind,
            fatal: PermanentFailure.is(err).toString(),
            isSuccess: false,
            name: "cgn.exception.upsertSpecialService.failure"
          }
        });
        context.log.error(error);
        if (PermanentFailure.is(err)) {
          throw new Error(err.reason);
        }
        return err;
      },
      () => success()
    ),
    TE.toUnion
  )();
