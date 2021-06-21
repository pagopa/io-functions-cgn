import * as express from "express";
import { Context } from "@azure/functions";
import * as df from "durable-functions";
import { DurableOrchestrationStatus } from "durable-functions/lib/src/classes";
import { fromOption, toError } from "fp-ts/lib/Either";
import { identity } from "fp-ts/lib/function";
import { fromNullable, none, some } from "fp-ts/lib/Option";
import { Option } from "fp-ts/lib/Option";
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
  ResponseErrorForbiddenNotAuthorized,
  ResponseErrorInternal,
  ResponseSuccessAccepted,
  ResponseSuccessRedirectToResource
} from "italia-ts-commons/lib/responses";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import { OrchestratorInput } from "../DeleteCgnOrchestrator/handler";
import { CardActivated } from "../generated/definitions/CardActivated";
import { CardExpired } from "../generated/definitions/CardExpired";
import { CardPending } from "../generated/definitions/CardPending";
import {
  CardPendingDelete
} from "../generated/definitions/CardPendingDelete";
import { CcdbNumber } from "../generated/definitions/CcdbNumber";
import { InstanceId } from "../generated/definitions/InstanceId";
import { UserCgnModel } from "../models/user_cgn";
import {
  RetrievedUserEycaCard,
  UserEycaCardModel
} from "../models/user_eyca_card";
import { makeUpdateCgnOrchestratorId } from "../utils/orchestrators";
import { checkUpdateCardIsRunning } from "../utils/orchestrators";
import { EycaCardRevoked } from "../generated/definitions/EycaCardRevoked";
import { EycaCardPendingDelete } from "../generated/definitions/EycaCardPendingDelete";

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
 * Check if a citizen has an active CGN Card
 * @param fiscalCode: the citizen's fiscalCode
 */
const hasCgn = (
  fiscalCode: FiscalCode,
  userCgnModel: UserCgnModel
): TaskEither<
  IResponseErrorInternal | IResponseErrorForbiddenNotAuthorized,
  true
> =>
  userCgnModel
    .findLastVersionByModelId([fiscalCode])
    .mapLeft<IResponseErrorInternal | IResponseErrorForbiddenNotAuthorized>(
      () => ResponseErrorInternal("Cannot find any CGN for that CF")
    )
    .chain(maybeUserCgn =>
      fromEither(fromOption(ResponseErrorForbiddenNotAuthorized)(maybeUserCgn))
    )
    .chain(userCgn =>
      fromPredicate(
        CardActivated.is || CardExpired.is || CardPending.is,
        () => ResponseErrorForbiddenNotAuthorized
      )(userCgn)
    )
    .map(_ => true);

const getEycaCcdbNumber = (
  fiscalCode: FiscalCode,
  userEycaCardModel: UserEycaCardModel
): TaskEither<
  IResponseErrorInternal | IResponseErrorForbiddenNotAuthorized,
  Option<CcdbNumber>
> =>
  userEycaCardModel
    .findLastVersionByModelId([fiscalCode])
    .mapLeft<IResponseErrorInternal | IResponseErrorForbiddenNotAuthorized>(
      () => ResponseErrorInternal("Cannot find any EYCA for that CF")
    )
    .chain<RetrievedUserEycaCard>(maybeEycaCard =>
      fromEither(
        fromOption(ResponseErrorInternal("Cannot retriew EYCA card"))(
          maybeEycaCard
        )
      )
    )
    .chain(eycaCard =>
      fromPredicate(
        (eycaCard: RetrievedUserEycaCard) =>
          CardPending.is(eycaCard) ||
          EycaCardRevoked.is(eycaCard) ||
          EycaCardPendingDelete.is(eycaCard),
        () =>
          ResponseErrorInternal(
            `Cannot delete an EYCA card that is ${eycaCard.card.status}`
          )
      )(eycaCard)
    )
    .map(eycaCard =>
      !CardPending.is(eycaCard.card) ? some(eycaCard.card.card_number) : none
    );

export function DeleteCardActivationHandler(
  userEycaCardModel: UserEycaCardModel,
  userCgnModel: UserCgnModel,
  logPrefix: string = "DeleteCardActivationHandler"
): IDeleteCardActivationHandler {
  return async (context, fiscalCode) => {
    const client = df.getClient(context);

    const orchestratorId = makeUpdateCgnOrchestratorId(
      fiscalCode,
      CardPendingDeleteStatusEnum.PENDING_DELETE
    ) as NonEmptyString;

    const card: CardPendingDelete = {
      status: CardPendingDeleteStatusEnum.PENDING_DELETE
    };

    return hasCgn(fiscalCode, userCgnModel)
      .chain<Option<CcdbNumber>>(() =>
        getEycaCcdbNumber(fiscalCode, userEycaCardModel)
      )
      .chain(maybeCcdbNumber =>
        // if EYCA card is in PENDING status, try to get orchestrator status
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
          .map(() => maybeCcdbNumber);
      })
      .chain(maybeCcdbNumber =>
        // now we check if exists another update process for the same CGN
        checkUpdateCardIsRunning(client, fiscalCode, card).foldTaskEither<
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
            userCgnModel
              .upsert({
                card: { status: CardPendingDeleteStatusEnum.PENDING_DELETE },
                fiscalCode,
                kind: "IDeleteCGNCard"
              })
              .mapLeft(e =>
                ResponseErrorInternal(`Cannot insert a new CGN|${e.kind}`)
              )
              .chain(() =>
                tryCatch(
                  () =>
                    // Starting a new activation process with proper input
                    client.startNew(
                      "DeleteCgnOrchestrator",
                      orchestratorId,
                      OrchestratorInput.encode({
                        fiscalCode,
                        eycaCardNumber: maybeCcdbNumber.toUndefined()
                      })
                    ),
                  toError
                ).mapLeft(err => {
                  context.log.error(
                    `${logPrefix}|Cannot start DeleteCgnOrchestrator|ERROR=${err.message}`
                  );
                  return ResponseErrorInternal(
                    "Cannot start DeleteCgnOrchestrator"
                  );
                })
              )
              .map(() => {
                const instanceId: InstanceId = {
                  id: orchestratorId
                };
                return ResponseSuccessRedirectToResource(
                  instanceId,
                  `/api/v1/cgn/${fiscalCode}/delete`,
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
  const handler = DeleteCardActivationHandler(userEycaCardModel, userCgnModel);

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    RequiredParamMiddleware("fiscalcode", FiscalCode)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
