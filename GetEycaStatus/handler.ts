import * as express from "express";

import { Context } from "@azure/functions";
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
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseErrorConflict,
  ResponseErrorForbiddenNotAuthorized,
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { flow, pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";

import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { CardPending } from "../generated/definitions/CardPending";
import { EycaCard } from "../generated/definitions/EycaCard";
import { UserCgnModel } from "../models/user_cgn";
import { UserEycaCardModel } from "../models/user_eyca_card";
import { isEycaEligible } from "../utils/cgn_checks";

type ErrorTypes =
  | IResponseErrorNotFound
  | IResponseErrorInternal
  | IResponseErrorConflict
  | IResponseErrorForbiddenNotAuthorized;
type ResponseTypes = IResponseSuccessJson<EycaCard> | ErrorTypes;

type IGetEycaStatusHandler = (
  context: Context,
  fiscalCode: FiscalCode
) => Promise<ResponseTypes>;

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function GetEycaStatusHandler(
  userEycaCardModel: UserEycaCardModel,
  userCgnModel: UserCgnModel,
  eycaUpperBoundAge: NonNegativeInteger
): IGetEycaStatusHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return async (_, fiscalCode) =>
    pipe(
      isEycaEligible(fiscalCode, eycaUpperBoundAge),
      TE.fromEither,
      TE.mapLeft(() =>
        ResponseErrorInternal("Cannot perform user's EYCA eligibility check")
      ),
      TE.chainW(
        TE.fromPredicate(
          isEligible => isEligible,
          () => ResponseErrorForbiddenNotAuthorized
        )
      ),
      TE.chainW(() =>
        pipe(
          userEycaCardModel.findLastVersionByModelId([fiscalCode]),
          TE.mapLeft(() =>
            ResponseErrorInternal(
              "Error trying to retrieve user's EYCA Card status"
            )
          )
        )
      ),
      TE.chainW(
        flow(
          TE.fromOption(() =>
            ResponseErrorNotFound(
              "Not Found",
              "User's EYCA Card status not found"
            )
          ),
          TE.orElseW(notFoundError =>
            pipe(
              userCgnModel.findLastVersionByModelId([fiscalCode]),
              TE.mapLeft(() =>
                ResponseErrorInternal(
                  "Error trying to retrieve user's CGN Card status"
                )
              ),
              TE.chainW(maybeUserCgn =>
                pipe(
                  maybeUserCgn,
                  TE.fromOption(() => notFoundError)
                )
              ),
              TE.chainW(
                TE.fromPredicate(
                  userCgn => CardPending.is(userCgn.card),
                  () =>
                    ResponseErrorConflict(
                      "EYCA Card is missing while citizen is eligible to obtain it"
                    )
                )
              ),
              TE.chainW(() => TE.left(notFoundError))
            )
          )
        )
      ),
      TE.map(userEycaCard => ResponseSuccessJson(userEycaCard.card)),
      TE.toUnion
    )();
}

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function GetEycaStatus(
  userEycaCardModel: UserEycaCardModel,
  userCgnModel: UserCgnModel,
  eycaUpperBoundAge: NonNegativeInteger
): express.RequestHandler {
  const handler = GetEycaStatusHandler(
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
