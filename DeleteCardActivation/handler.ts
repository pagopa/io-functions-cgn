import { Context } from "@azure/functions";
import { ResponseErrorConflict } from "@pagopa/ts-commons/lib/responses";
import * as df from "durable-functions";
import { DurableOrchestrationStatus } from "durable-functions/lib/src/classes";
import * as express from "express";
import * as E from "fp-ts/lib/Either";
import { pipe, flow } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
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
} from "@pagopa/ts-commons/lib/responses";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { OrchestratorInput } from "../DeleteCgnOrchestrator/handler";
import { Card } from "../generated/definitions/Card";
import { CardActivated } from "../generated/definitions/CardActivated";
import { CardExpired } from "../generated/definitions/CardExpired";
import { StatusEnum as CardPendingDeleteStatusEnum } from "../generated/definitions/CardPendingDelete";
import { CcdbNumber } from "../generated/definitions/CcdbNumber";
import { EycaCardActivated } from "../generated/definitions/EycaCardActivated";
import { EycaCardExpired } from "../generated/definitions/EycaCardExpired";
import { InstanceId } from "../generated/definitions/InstanceId";
import { UserCgn, UserCgnModel } from "../models/user_cgn";
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
 * Check if a citizen has an active CGN Card
 *
 * @param fiscalCode: the citizen's fiscalCode
 */
const readLastCgn = (
  fiscalCode: FiscalCode,
  userCgnModel: UserCgnModel
): TE.TaskEither<
  IResponseErrorInternal | IResponseErrorForbiddenNotAuthorized,
  UserCgn
> =>
  pipe(
    userCgnModel.findLastVersionByModelId([fiscalCode]),
    TE.mapLeft(() => ResponseErrorInternal("Cannot find any CGN for that CF")),
    TE.chainW(maybeUserCgn =>
      TE.fromOption(() => ResponseErrorForbiddenNotAuthorized)(maybeUserCgn)
    ),
    TE.chainW(
      TE.fromPredicate(
        userCgn =>
          CardActivated.is(userCgn.card) || CardExpired.is(userCgn.card),
        () => ResponseErrorForbiddenNotAuthorized
      )
    )
  );

const getEycaCcdbNumber = (
  fiscalCode: FiscalCode,
  userEycaCardModel: UserEycaCardModel
): TE.TaskEither<ErrorTypes | IResponseSuccessAccepted, O.Option<CcdbNumber>> =>
  pipe(
    userEycaCardModel.findLastVersionByModelId([fiscalCode]),
    TE.mapLeft(() => ResponseErrorInternal("Cannot find any EYCA for that CF")),
    TE.chainW(
      O.fold(
        () => TE.of(O.none),
        eycaCard =>
          EycaCardActivated.is(eycaCard.card) ||
          EycaCardExpired.is(eycaCard.card)
            ? TE.of(O.some(eycaCard.card.card_number))
            : TE.left(
                ResponseErrorConflict(
                  `Cannot delete an EYCA card that it doesn't match status with cgn card`
                )
              )
      )
    )
  );

export const DeleteCardActivationHandler = (
  userEycaCardModel: UserEycaCardModel,
  userCgnModel: UserCgnModel,
  logPrefix: string = "DeleteCardActivationHandler"
): IDeleteCardActivationHandler =>
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async (context, fiscalCode) => {
    const client = df.getClient(context);

    const orchestratorId = makeUpdateCgnOrchestratorId(
      fiscalCode,
      CardPendingDeleteStatusEnum.PENDING_DELETE
    ) as NonEmptyString;

    return pipe(
      readLastCgn(fiscalCode, userCgnModel),
      TE.chain(userCgnCard =>
        pipe(
          getEycaCcdbNumber(fiscalCode, userEycaCardModel),
          TE.map(maybeCcdbNumber => ({
            eycaCardNumber: O.toUndefined(maybeCcdbNumber),
            userCgn: userCgnCard
          }))
        )
      ),
      TE.chainW(userCardsData =>
        pipe(
          TE.tryCatch(() => client.getStatus(orchestratorId), E.toError),
          TE.mapLeft(() =>
            ResponseErrorInternal("Cannot retrieve activation status")
          ),
          TE.chainW(
            flow(
              O.fromNullable,
              O.fold(
                () => TE.of(userCardsData),
                flow(
                  mapOrchestratorStatus,
                  TE.map(() => userCardsData)
                )
              )
            )
          )
        )
      ),
      TE.chainW(({ userCgn, eycaCardNumber }) =>
        // now we check if exists another update process for the same CGN
        pipe(
          checkUpdateCardIsRunning(client, fiscalCode, {
            ...userCgn.card,
            status: CardPendingDeleteStatusEnum.PENDING_DELETE
          } as Card),
          TE.chainW(() =>
            // We can generate an internal CGN identifier and insert a new CGN in a PENDING status
            pipe(
              userCgnModel.upsert({
                ...userCgn,
                card: {
                  ...userCgn.card,
                  status: CardPendingDeleteStatusEnum.PENDING_DELETE
                } as Card,
                fiscalCode,
                kind: "INewUserCgn"
              }),
              TE.mapLeft(e =>
                ResponseErrorInternal(
                  `Cannot insert a new version of CGN on PENDING_DELETE|${e.kind}`
                )
              ),
              TE.chainW(() =>
                pipe(
                  TE.tryCatch(
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
                    E.toError
                  ),
                  TE.mapLeft(err => {
                    context.log.error(
                      `${logPrefix}|Cannot start DeleteCgnOrchestrator|ERROR=${err.message}`
                    );
                    return ResponseErrorInternal(
                      "Cannot start DeleteCgnOrchestrator"
                    );
                  })
                )
              ),
              TE.map(() => {
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

export const DeleteCardActivation = (
  userEycaCardModel: UserEycaCardModel,
  userCgnModel: UserCgnModel
): express.RequestHandler => {
  const handler = DeleteCardActivationHandler(userEycaCardModel, userCgnModel);

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    RequiredParamMiddleware("fiscalcode", FiscalCode)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
};
