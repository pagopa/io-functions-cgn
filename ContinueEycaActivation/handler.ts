import { Context } from "@azure/functions";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import * as df from "durable-functions";
import { toError } from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { StatusEnum } from "../generated/definitions/CardPending";
import { OrchestratorInput } from "../StartEycaActivationOrchestrator/index";
import { trackException } from "../utils/appinsights";
import { extractEycaExpirationDate } from "../utils/cgn_checks";
import { Failure, PermanentFailure, TransientFailure } from "../utils/errors";
import { makeEycaOrchestratorId } from "../utils/orchestrators";

export const ContinueEycaActivationInput = t.interface({
  fiscalCode: FiscalCode
});
export type ContinueEycaActivationInput = t.TypeOf<
  typeof ContinueEycaActivationInput
>;

const permanentDecodeFailure = (errs: t.Errors) =>
  Failure.encode({
    kind: "PERMANENT",
    reason: `Cannot decode input: ${readableReport(errs)}`
  });

const transientOrchestratorError = (err: unknown) =>
  Failure.encode({
    kind: "TRANSIENT",
    reason: `Error starting the orchestrator: ${toError(err).message}`
  });

/**
 * Reads from a queue the fiscalCode
 * then try to start the orchestrator to activate the EYCA card.
 */
export const ContinueEycaActivationHandler = (
  context: Context,
  message: unknown,
  eycaUpperBoundAge: NonNegativeInteger
): Promise<Failure | string> => {
  return pipe(
    message,
    ContinueEycaActivationInput.decode,
    TE.fromEither,
    TE.mapLeft(permanentDecodeFailure),
    TE.chainW(({ fiscalCode }) =>
      pipe(
        extractEycaExpirationDate(fiscalCode, eycaUpperBoundAge),
        TE.fromEither,
        TE.mapLeft(e =>
          Failure.encode({
            kind: "PERMANENT",
            reason: `Cannot extractFiscalCode: ${e.message}`
          })
        ),
        TE.chain(expirationDate =>
          TE.tryCatch(
            () =>
              df.getClient(context).startNew(
                "StartEycaActivationOrchestrator",
                makeEycaOrchestratorId(fiscalCode, StatusEnum.PENDING),
                OrchestratorInput.encode({
                  activationDate: new Date(),
                  expirationDate,
                  fiscalCode
                })
              ),
            transientOrchestratorError
          )
        ),
        TE.mapLeft(err => {
          const error = TransientFailure.is(err)
            ? `ContinueEycaActivation|TRANSIENT_ERROR=${err.reason}`
            : `ContinueEycaActivation|FATAL|PERMANENT_ERROR=${
                err.reason
              }|INPUT=${JSON.stringify(message)}`;
          trackException({
            exception: new Error(error),
            properties: {
              // In case the the input (message from queue) cannot be decoded
              // we mark this as a FATAL error since the lock on user's family won't be relased
              detail: err.kind,
              fatal: PermanentFailure.is(err).toString(),
              isSuccess: false,
              name: "cgn.eyca.activation.orchestrator.start"
            }
          });
          context.log.error(error);
          if (TransientFailure.is(err)) {
            // Trigger a retry in case of temporary failures
            throw new Error(error);
          }
          return err;
        })
      )
    ),
    TE.toUnion
  )();
};
