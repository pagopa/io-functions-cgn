import * as express from "express";

import { Context } from "@azure/functions";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import {
  IResponseErrorConflict,
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorInternal,
  IResponseSuccessAccepted,
  IResponseSuccessRedirectToResource,
  ResponseErrorConflict,
  ResponseErrorForbiddenNotAuthorized,
  ResponseErrorInternal,
  ResponseSuccessAccepted,
  ResponseSuccessRedirectToResource
} from "@pagopa/ts-commons/lib/responses";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as df from "durable-functions";
import { DurableOrchestrationStatus } from "durable-functions/lib/src/classes";
import * as E from "fp-ts/lib/Either";
import { flow, pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { CardActivated } from "../generated/definitions/CardActivated";
import {
  CardPending,
  StatusEnum as PendingStatusEnum
} from "../generated/definitions/CardPending";
import { InstanceId } from "../generated/definitions/InstanceId";
import { UserCgnModel } from "../models/user_cgn";
import { UserEycaCardModel } from "../models/user_eyca_card";
import { OrchestratorInput } from "../StartEycaActivationOrchestrator";
import { extractEycaExpirationDate, isEycaEligible } from "../utils/cgn_checks";
import { makeEycaOrchestratorId } from "../utils/orchestrators";
import { checkUpdateCardIsRunning } from "../utils/orchestrators";

type ErrorTypes =
  | IResponseErrorInternal
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorConflict;
export type ReturnTypes =
  | IResponseSuccessAccepted
  | IResponseSuccessRedirectToResource<InstanceId, InstanceId>
  | ErrorTypes;

export type IStartCgnActivationHandler = (
  context: Context,
  fiscalCode: FiscalCode
) => Promise<ReturnTypes>;

const mapOrchestratorStatus = (
  orchestratorStatus: DurableOrchestrationStatus
): TE.TaskEither<IResponseSuccessAccepted, IResponseErrorInternal> => {
  switch (orchestratorStatus.runtimeStatus) {
    case df.OrchestrationRuntimeStatus.Pending:
    case df.OrchestrationRuntimeStatus.Running:
    case df.OrchestrationRuntimeStatus.ContinuedAsNew:
      return TE.left(ResponseSuccessAccepted());
    default:
      return TE.of(
        ResponseErrorInternal("Cannot recognize the orchestrator status")
      );
  }
};

/**
 * Check if a citizen is eligible for EYCA activation
 * A citizen is eligible for EYCA while he's from 18 to 30 years old
 * and it has already activated a CGN
 *
 * @param fiscalCode: the citizen's fiscalCode
 */
const getEycaEligibleTask = (
  fiscalCode: FiscalCode,
  userCgnModel: UserCgnModel,
  eycaUpperBoundAge: NonNegativeInteger
): TE.TaskEither<
  IResponseErrorInternal | IResponseErrorForbiddenNotAuthorized,
  true
> =>
  pipe(
    isEycaEligible(fiscalCode, eycaUpperBoundAge),
    TE.fromEither,
    TE.mapLeft(() =>
      ResponseErrorInternal("Cannot perform EYCA Eligibility Check")
    ),
    TE.chainW(
      TE.fromPredicate(
        _ => _ === true,
        () => ResponseErrorForbiddenNotAuthorized
      )
    ),
    TE.chainW(() =>
      pipe(
        userCgnModel.findLastVersionByModelId([fiscalCode]),
        TE.mapLeft(() => ResponseErrorInternal("Cannot query CGN data")),
        TE.chainW(
          flow(
            TE.fromOption(() => ResponseErrorForbiddenNotAuthorized),
            TE.chainW(userCgn =>
              TE.fromPredicate(
                CardActivated.is,
                () => ResponseErrorForbiddenNotAuthorized
              )(userCgn.card)
            ),
            TE.map(_ => true)
          )
        )
      )
    )
  );

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function StartEycaActivationHandler(
  userEycaCardModel: UserEycaCardModel,
  userCgnModel: UserCgnModel,
  eycaUpperBoundAge: NonNegativeInteger,
  logPrefix: string = "StartEycaActivationHandler"
): IStartCgnActivationHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return async (context, fiscalCode) => {
    const client = df.getClient(context);
    const orchestratorId = makeEycaOrchestratorId(
      fiscalCode,
      PendingStatusEnum.PENDING
    ) as NonEmptyString;

    const isEycaEligibleOrError = await getEycaEligibleTask(
      fiscalCode,
      userCgnModel,
      eycaUpperBoundAge
    )();
    if (E.isLeft(isEycaEligibleOrError)) {
      return isEycaEligibleOrError.left;
    }

    const card: CardPending = {
      status: PendingStatusEnum.PENDING
    };
    return pipe(
      userEycaCardModel.findLastVersionByModelId([fiscalCode]),
      TE.mapLeft(() => ResponseErrorInternal("Cannot query EYCA data")),
      TE.chain(
        O.fold(
          () => TE.of(void 0),
          userEycaCard =>
            // if an EYCA card is already in a final state we return Conflict
            !CardPending.is(userEycaCard.card)
              ? TE.left<
                  | IResponseErrorConflict
                  | IResponseErrorInternal
                  | IResponseSuccessAccepted<undefined>,
                  void
                >(
                  ResponseErrorConflict(
                    `Cannot activate an EYCA card that is already ${userEycaCard.card.status}`
                  )
                )
              : // if EYCA card is in PENDING status, try to get orchestrator status
                // in order to discriminate if there's an error or not
                pipe(
                  TE.tryCatch(
                    () => client.getStatus(orchestratorId),
                    E.toError
                  ),
                  TE.mapLeft(() =>
                    ResponseErrorInternal("Cannot retrieve activation status")
                  ),
                  TE.chainW(
                    // client getStatus could respond with undefined if
                    // an orchestrator instance does not exists
                    // see https://docs.microsoft.com/it-it/azure/azure-functions/durable/durable-functions-instance-management?tabs=javascript#query-instances
                    flow(
                      O.fromNullable,
                      O.fold(
                        // if orchestrator does not exists we assume that it expires its storage in TaskHub
                        // after 30 days so we can try to start a new activation process
                        () => TE.of(void 0),
                        _ =>
                          // if orchestrator is running we return an Accepted Response
                          // otherwise we assume the orchestrator is in error or
                          // it has been canceled so we can try to start a new activation process
                          pipe(
                            mapOrchestratorStatus(_),
                            TE.map(() => void 0)
                          )
                      )
                    )
                  )
                )
        )
      ),
      TE.chainW(() =>
        // now we check if exists another update process for the same EYCA Card
        pipe(
          checkUpdateCardIsRunning(
            client,
            fiscalCode,
            card,
            makeEycaOrchestratorId
          ),
          TE.chainW(() =>
            // We can insert a new EYCA Card in a PENDING status
            pipe(
              userEycaCardModel.upsert({
                card: { status: PendingStatusEnum.PENDING },
                fiscalCode,
                kind: "INewUserEycaCard"
              }),
              TE.mapLeft(e =>
                ResponseErrorInternal(`Cannot insert a new EYCA card|${e.kind}`)
              ),
              TE.chain(() =>
                pipe(
                  extractEycaExpirationDate(fiscalCode, eycaUpperBoundAge),
                  TE.fromEither,
                  TE.mapLeft(() =>
                    ResponseErrorInternal(
                      `Error extracting Expiration Date from Fiscal Code`
                    )
                  ),
                  TE.chain(expirationDate =>
                    pipe(
                      TE.tryCatch(
                        () =>
                          // Starting a new activation process with proper input
                          client.startNew(
                            "StartEycaActivationOrchestrator",
                            orchestratorId,
                            OrchestratorInput.encode({
                              activationDate: new Date(),
                              expirationDate,
                              fiscalCode
                            })
                          ),
                        E.toError
                      ),
                      TE.mapLeft(err => {
                        context.log.error(
                          `${logPrefix}|Cannot start StartEycaActivationOrchestrator|ERROR=${err.message}`
                        );
                        return ResponseErrorInternal(
                          "Cannot start StartEycaActivationOrchestrator"
                        );
                      })
                    )
                  )
                )
              ),
              TE.map(() => {
                const instanceId: InstanceId = {
                  id: orchestratorId
                };
                return ResponseSuccessRedirectToResource(
                  instanceId,
                  `/api/v1/cgn/${fiscalCode}/eyca/activation`,
                  instanceId
                );
              })
            )
          ),
          TE.orElseW(response =>
            response.kind === "IResponseSuccessAccepted"
              ? TE.of(response)
              : TE.left(response)
          )
        )
      ),
      TE.toUnion
    )();
  };
}

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function StartEycaActivation(
  userEycaCardModel: UserEycaCardModel,
  userCgnModel: UserCgnModel,
  eycaUpperBoundAge: NonNegativeInteger
): express.RequestHandler {
  const handler = StartEycaActivationHandler(
    userEycaCardModel,
    userCgnModel,
    eycaUpperBoundAge
  );

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    RequiredParamMiddleware("fiscalcode", FiscalCode)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
