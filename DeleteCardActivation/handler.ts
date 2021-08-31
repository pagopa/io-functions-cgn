import { Context } from "@azure/functions";
import { ResponseErrorConflict } from "@pagopa/ts-commons/lib/responses";
import * as df from "durable-functions";
import { DurableOrchestrationStatus } from "durable-functions/lib/src/classes";
import * as express from "express";
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
import { Card } from "../generated/definitions/Card";
import { CardActivated } from "../generated/definitions/CardActivated";
import { CardExpired } from "../generated/definitions/CardExpired";
import { StatusEnum as CardPendingDeleteStatusEnum } from "../generated/definitions/CardPendingDelete";
import { CcdbNumber } from "../generated/definitions/CcdbNumber";
import { EycaCardActivated } from "../generated/definitions/EycaCardActivated";
import { EycaCardExpired } from "../generated/definitions/EycaCardExpired";
import { InstanceId } from "../generated/definitions/InstanceId";
import { UserCgnModel } from "../models/user_cgn";
import { UserEycaCardModel } from "../models/user_eyca_card";
import { makeUpdateCgnOrchestratorId } from "../utils/orchestrators";
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
 * Check if a citizen has an active CGN Card
 * @param fiscalCode: the citizen's fiscalCode
 */
const readLastCgn = (fiscalCode: FiscalCode, userCgnModel: UserCgnModel) =>
  userCgnModel
    .findLastVersionByModelId([fiscalCode])
    .mapLeft<ErrorTypes | IResponseSuccessAccepted>(() =>
      ResponseErrorInternal("Cannot find any CGN for that CF")
    )
    .chain(maybeUserCgn =>
      fromEither(fromOption(ResponseErrorForbiddenNotAuthorized)(maybeUserCgn))
    )
    .chain(userCgn =>
      fromPredicate(
        CardActivated.is || CardExpired.is,
        () => ResponseErrorForbiddenNotAuthorized
      )(userCgn.card).map(_ => userCgn)
    );

const getEycaCcdbNumber = (
  fiscalCode: FiscalCode,
  userEycaCardModel: UserEycaCardModel
): TaskEither<ErrorTypes | IResponseSuccessAccepted, Option<CcdbNumber>> =>
  userEycaCardModel
    .findLastVersionByModelId([fiscalCode])
    .mapLeft<ErrorTypes | IResponseSuccessAccepted>(() =>
      ResponseErrorInternal("Cannot find any EYCA for that CF")
    )
    .chain(maybeEycaCard =>
      maybeEycaCard.foldL(
        () => taskEither.of(none),
        eycaCard =>
          EycaCardActivated.is(eycaCard) || EycaCardExpired.is(eycaCard)
            ? taskEither.of(some(eycaCard.card_number))
            : fromLeft(
                ResponseErrorConflict(
                  `Cannot delete an EYCA card that is ${eycaCard.card.status}`
                )
              )
      )
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

    return readLastCgn(fiscalCode, userCgnModel)
      .chain(userCgnCard =>
        getEycaCcdbNumber(fiscalCode, userEycaCardModel).map(
          maybeCcdbNumber => ({
            eycaCardNumber: maybeCcdbNumber.toUndefined(),
            userCgn: userCgnCard
          })
        )
      )
      .chain(userCardsData =>
        tryCatch(() => client.getStatus(orchestratorId), toError)
          .mapLeft<ErrorTypes | IResponseSuccessAccepted>(() =>
            ResponseErrorInternal("Cannot retrieve activation status")
          )
          .chain(maybeStatus =>
            fromNullable(maybeStatus).foldL(
              () => taskEither.of(userCardsData),
              _ => mapOrchestratorStatus(_).map(() => userCardsData)
            )
          )
      )
      .chain(({ userCgn, eycaCardNumber }) =>
        // now we check if exists another update process for the same CGN
        checkUpdateCardIsRunning(client, fiscalCode, {
          ...userCgn.card,
          status: CardPendingDeleteStatusEnum.PENDING_DELETE
        } as Card).foldTaskEither<
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
                ...userCgn,
                card: {
                  ...userCgn.card,
                  status: CardPendingDeleteStatusEnum.PENDING_DELETE
                } as Card,
                fiscalCode,
                kind: "INewUserCgn"
              })
              .mapLeft(e =>
                ResponseErrorInternal(
                  `Cannot insert a new version of CGN on PENDING_DELETE|${e.kind}`
                )
              )
              .chain(() =>
                tryCatch(
                  () =>
                    // Starting a new activation process with proper input
                    client.startNew(
                      "DeleteCgnOrchestrator",
                      orchestratorId,
                      OrchestratorInput.encode({
                        eycaCardNumber,
                        fiscalCode
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
