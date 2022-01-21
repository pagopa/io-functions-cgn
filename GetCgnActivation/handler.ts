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
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";

import * as df from "durable-functions";
import { DurableOrchestrationClient } from "durable-functions/lib/src/classes";
import * as E from "fp-ts/lib/Either";
import { flow, pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import {
  CardActivated,
  StatusEnum as ActivatedStatusEnum
} from "../generated/definitions/CardActivated";
import {
  CgnActivationDetail,
  StatusEnum
} from "../generated/definitions/CgnActivationDetail";
import { InstanceId } from "../generated/definitions/InstanceId";
import { UserCgnModel } from "../models/user_cgn";
import { getActivationStatus } from "../utils/activation";
import { retrieveUserCgn } from "../utils/models";
import {
  getOrchestratorStatus,
  makeUpdateCgnOrchestratorId
} from "../utils/orchestrators";
import { trackException } from "../utils/appinsights";

type ResponseTypes =
  | IResponseSuccessJson<CgnActivationDetail>
  | IResponseErrorNotFound
  | IResponseErrorInternal;

type IGetCgnActivationHandler = (
  context: Context,
  fiscalCode: FiscalCode
) => Promise<ResponseTypes>;

const terminateOrchestratorTask = (
  client: DurableOrchestrationClient,
  orchestratorId: NonEmptyString,
  activationDetail: CgnActivationDetail,
  customStatus: string
): TE.TaskEither<unknown, CgnActivationDetail> =>
  pipe(
    TE.tryCatch(
      () => client.terminate(orchestratorId, "Async flow not necessary"),
      E.toError
    ),
    TE.bimap(
      error => {
        trackException({
          exception: error,
          properties: {
            detail: error.message,
            name: "cgn.activation.orchestrator.terminate.failure"
          },
          tagOverrides: { samplingEnabled: "false" }
        });
        return error;
      },
      () => ({
        ...activationDetail,
        status:
          customStatus === "ERROR" ? StatusEnum.ERROR : StatusEnum.COMPLETED
      })
    ),
    TE.orElse(() => TE.of(activationDetail))
  );

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function GetCgnActivationHandler(
  userCgnModel: UserCgnModel
): IGetCgnActivationHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return async (context, fiscalCode) => {
    const client = df.getClient(context);
    const orchestratorId = makeUpdateCgnOrchestratorId(
      fiscalCode,
      ActivatedStatusEnum.ACTIVATED
    ) as NonEmptyString;
    const instanceId = {
      id: orchestratorId
    } as InstanceId;

    return pipe(
      retrieveUserCgn(userCgnModel, fiscalCode),
      TE.map(_ => _.card),
      TE.chainW(cgn =>
        pipe(
          getOrchestratorStatus(client, orchestratorId),
          TE.mapLeft(() =>
            ResponseErrorInternal("Cannot retrieve activation status")
          ),
          TE.chainW(
            flow(
              O.fromNullable,
              O.fold(
                () =>
                  TE.left(
                    ResponseErrorNotFound(
                      "Cannot find any activation process",
                      "Orchestrator instance not found"
                    )
                  ),
                orchestrationStatus =>
                  // now try to map orchestrator status
                  pipe(
                    getActivationStatus(orchestrationStatus),
                    TE.fromOption(() =>
                      ResponseErrorNotFound(
                        "Not Found",
                        "User's CGN status not found"
                      )
                    ),
                    TE.map(_ => ({
                      activationDetail: {
                        created_at: orchestrationStatus.createdTime,
                        instance_id: instanceId,
                        last_updated_at: orchestrationStatus.lastUpdatedTime,
                        status: _
                      },
                      customStatus: orchestrationStatus.customStatus
                    }))
                  )
              )
            )
          ),
          TE.chainW(({ activationDetail, customStatus }) =>
            // if CGN is already updated to ACTIVATED while orchestrator is still running
            // we can try to terminate running orchestrator in fire&forget to allow sync flow
            // i.e UPDATED status means that the orchestrator is running and userCgn status' update is performed.
            // Otherwise we return the original orchestrator status
            (customStatus === "UPDATED" && CardActivated.is(cgn)) ||
            customStatus === "ERROR"
              ? terminateOrchestratorTask(
                  client,
                  orchestratorId,
                  activationDetail,
                  customStatus
                )
              : TE.of(activationDetail)
          ),
          TE.orElse(() =>
            // It's not possible to map any activation status
            // check for CGN status on cosmos
            pipe(
              TE.of(
                CardActivated.is(cgn)
                  ? StatusEnum.COMPLETED
                  : StatusEnum.PENDING
              ),
              TE.map(_ => ({ instance_id: instanceId, status: _ }))
            )
          )
        )
      ),
      TE.map(ResponseSuccessJson),
      TE.toUnion
    )();
  };
}

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function GetCgnActivation(
  userCgnModel: UserCgnModel
): express.RequestHandler {
  const handler = GetCgnActivationHandler(userCgnModel);

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    RequiredParamMiddleware("fiscalcode", FiscalCode)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
