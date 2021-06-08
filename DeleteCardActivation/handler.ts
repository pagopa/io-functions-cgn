import * as express from "express";

import { Context } from "@azure/functions";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import * as df from "durable-functions";
import { DurableOrchestrationStatus } from "durable-functions/lib/src/classes";
import { fromOption, toError } from "fp-ts/lib/Either";
import { isLeft } from "fp-ts/lib/Either";
import { identity } from "fp-ts/lib/function";
import { fromNullable } from "fp-ts/lib/Option";
import {
  fromEither,
  fromLeft,
  fromPredicate,
  TaskEither,
  taskEither,
  tryCatch
} from "fp-ts/lib/TaskEither";
import { ContextMiddleware } from "io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredParamMiddleware } from "io-functions-commons/dist/src/utils/middlewares/required_param";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "io-functions-commons/dist/src/utils/request_middleware";
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
} from "italia-ts-commons/lib/responses";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import { CardActivated } from "../generated/definitions/CardActivated";
import { CardPendingDelete, StatusEnum as CardPendingDeleteStatusEnum  } from "../generated/definitions/CardPendingDelete";
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

export type IDeleteCardActivationHandler = (
  context: Context,
  fiscalCode: FiscalCode
) => Promise<ReturnTypes>;

const mapOrchestratorStatus = (
  orchestratorStatus: DurableOrchestrationStatus
): TaskEither<IResponseSuccessAccepted, IResponseErrorInternal> => {
  switch (orchestratorStatus.runtimeStatus) {
    case df.OrchestrationRuntimeStatus.Pending:
    case df.OrchestrationRuntimeStatus.Running:
    case df.OrchestrationRuntimeStatus.ContinuedAsNew:
      return fromLeft(ResponseSuccessAccepted());
    default:
      return taskEither.of(
        ResponseErrorInternal("Cannot recognize the orchestrator status")
      );
  }
};

/**
 * Check if a citizen is eligible for EYCA activation
 * A citizen is eligible for EYCA while he's from 18 to 30 years old
 * and it has already activated a CGN
 * @param fiscalCode: the citizen's fiscalCode
 */
const hasCgn = (
  fiscalCode: FiscalCode,
  userCgnModel: UserCgnModel
): TaskEither<IResponseErrorInternal | IResponseErrorForbiddenNotAuthorized, true > => 
userCgnModel.findLastVersionByModelId([fiscalCode])
.mapLeft<IResponseErrorInternal | IResponseErrorForbiddenNotAuthorized>(
  () => ResponseErrorInternal("Cannot find any CGN for that CF")
)
.chain(userCgn =>
  fromPredicate(
    CardActivated.is,
    () => ResponseErrorForbiddenNotAuthorized
  )(userCgn)
)
.map(_ => true);

export function DeleteCardActivationHandler(
  userEycaCardModel: UserEycaCardModel,
  userCgnModel: UserCgnModel,
  logPrefix: string = "DeleteCardActivationHandler"
): IDeleteCardActivationHandler {
  return async (context, fiscalCode) => {
    const client = df.getClient(context);

    //TODO: check
    const orchestratorId = makeEycaOrchestratorId(
      fiscalCode,
      CardPendingDeleteStatusEnum.PENDING_DELETE
    ) as NonEmptyString;

    const hasCgnOrError = await hasCgn(
      fiscalCode,
      userCgnModel
    ).run();
    if (isLeft(hasCgnOrError)) {
      return hasCgnOrError.value;
    }

    const card: CardPendingDelete = {
      status: CardPendingDeleteStatusEnum.PENDING_DELETE
    };

    return userEycaCardModel
      .findLastVersionByModelId([fiscalCode])
      .mapLeft<ErrorTypes | IResponseSuccessAccepted>(() =>
        ResponseErrorInternal("Cannot query EYCA data")
      )
      .chain(maybeUserEycaCard =>
        maybeUserEycaCard.fold(taskEither.of(void 0), userEycaCard =>
          // if an EYCA card is already in a final state we return Conflict
          !CardPending.is(userEycaCard.card)
            ? fromLeft(
                ResponseErrorConflict(
                  `Cannot activate an EYCA card that is already ${userEycaCard.card.status}`
                )
              )
            : // if EYCA card is in PENDING status, try to get orchestrator status
              // in order to discriminate if there's an error or not
              tryCatch(() => client.getStatus(orchestratorId), toError)
                .mapLeft<ErrorTypes | IResponseSuccessAccepted>(() =>
                  ResponseErrorInternal("Cannot retrieve activation status")
                )
                .chain(maybeStatus =>
                  // client getStatus could respond with undefined if
                  // an orchestrator instance does not exists
                  // see https://docs.microsoft.com/it-it/azure/azure-functions/durable/durable-functions-instance-management?tabs=javascript#query-instances
                  fromNullable(maybeStatus).foldL(
                    // if orchestrator does not exists we assume that it expires its storage in TaskHub
                    // after 30 days so we can try to start a new activation process
                    () => taskEither.of(void 0),
                    _ =>
                      // if orchestrator is running we return an Accepted Response
                      // otherwise we assume the orchestrator is in error or
                      // it has been canceled so we can try to start a new activation process
                      mapOrchestratorStatus(_).map(() => void 0)
                  )
                )
        )
      )
      .chain(() =>
        // now we check if exists another update process for the same EYCA
        checkUpdateCardIsRunning(
          client,
          fiscalCode,
          card,
          makeEycaOrchestratorId
        ).foldTaskEither<
          ErrorTypes,
          | IResponseSuccessAccepted
          | IResponseSuccessRedirectToResource<InstanceId, InstanceId>
        >(
          response =>
            response.kind === "IResponseSuccessAccepted"
              ? taskEither.of(response)
              : fromLeft(response),
          () =>
            // We can generate an internal CGN identifier and insert a new CGN in a PENDING status
            userEycaCardModel
              .upsert({
                card: { status: PendingStatusEnum.PENDING },
                fiscalCode,
                kind: "INewUserEycaCard"
              })
              .mapLeft(e =>
                ResponseErrorInternal(`Cannot insert a new EYCA card|${e.kind}`)
              )
              .chain(() =>
                fromEither(
                  extractEycaExpirationDate(fiscalCode, eycaUpperBoundAge)
                )
                  .mapLeft(() =>
                    ResponseErrorInternal(
                      `Error extracting Expiration Date from Fiscal Code`
                    )
                  )
                  .chain(expirationDate =>
                    tryCatch(
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
                      toError
                    ).mapLeft(err => {
                      context.log.error(
                        `${logPrefix}|Cannot start StartEycaActivationOrchestrator|ERROR=${err.message}`
                      );
                      return ResponseErrorInternal(
                        "Cannot start StartEycaActivationOrchestrator"
                      );
                    })
                  )
              )
              .map(() => {
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
      )
      .fold<ReturnTypes>(identity, identity)
      .run();
  };
}

export function DeleteCardActivation(
  userEycaCardModel: UserEycaCardModel,
  userCgnModel: UserCgnModel
): express.RequestHandler {
  const handler = DeleteCardActivationHandler(
    userEycaCardModel,
    userCgnModel
  );

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    RequiredParamMiddleware("fiscalcode", FiscalCode)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
