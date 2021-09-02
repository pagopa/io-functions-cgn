import * as express from "express";

import { Context } from "@azure/functions";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import * as df from "durable-functions";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { CardActivated } from "../generated/definitions/CardActivated";
import { StatusEnum } from "../generated/definitions/CgnActivationDetail";
import { EycaActivationDetail } from "../generated/definitions/EycaActivationDetail";
import { UserEycaCardModel } from "../models/user_eyca_card";
import { getActivationStatus } from "../utils/activation";
import { retrieveUserEycaCard } from "../utils/models";
import {
  getOrchestratorStatus,
  makeEycaOrchestratorId
} from "../utils/orchestrators";

type ResponseTypes =
  | IResponseSuccessJson<EycaActivationDetail>
  | IResponseErrorNotFound
  | IResponseErrorInternal;

type IGetEycaActivationHandler = (
  context: Context,
  fiscalCode: FiscalCode
) => Promise<ResponseTypes>;

export function GetEycaActivationHandler(
  userEycaCardModel: UserEycaCardModel
): IGetEycaActivationHandler {
  return async (context, fiscalCode) => {
    const client = df.getClient(context);
    const orchestratorId = makeEycaOrchestratorId(
      fiscalCode,
      StatusEnum.PENDING
    );
    // first check if an activation process is running
    return pipe(
      retrieveUserEycaCard(userEycaCardModel, fiscalCode),
      TE.map(userEycaCard => userEycaCard.card),
      TE.chainW(eycaCard =>
        pipe(
          getOrchestratorStatus(client, orchestratorId),
          TE.chain(maybeOrchestrationStatus =>
            pipe(
              O.fromNullable(maybeOrchestrationStatus),
              O.fold(
                () => TE.left(new Error("Orchestrator instance not found")),
                orchestrationStatus =>
                  // now try to map orchestrator status
                  pipe(
                    getActivationStatus(orchestrationStatus),
                    E.fromOption(() => new Error("Cannot recognize status")),
                    TE.fromEither,
                    TE.map(_ => ({
                      created_at: orchestrationStatus.createdTime,
                      last_updated_at: orchestrationStatus.lastUpdatedTime,
                      status: _
                    }))
                  )
              )
            )
          ),
          TE.chain(activationDetail => TE.of(activationDetail)),
          TE.orElse(() =>
            // It's not possible to map any activation status
            // check for EYCA Card status on cosmos
            pipe(
              TE.of(
                CardActivated.is(eycaCard)
                  ? StatusEnum.COMPLETED
                  : StatusEnum.PENDING
              ),
              TE.map(_ => ({ status: _ }))
            )
          )
        )
      ),
      TE.map(ResponseSuccessJson),
      TE.toUnion
    )();
  };
}

export function GetEycaActivation(
  userEycaCardModel: UserEycaCardModel
): express.RequestHandler {
  const handler = GetEycaActivationHandler(userEycaCardModel);

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    RequiredParamMiddleware("fiscalcode", FiscalCode)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
