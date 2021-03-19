import * as express from "express";

import { Context } from "@azure/functions";
import { fromOption } from "fp-ts/lib/Either";
import { identity } from "fp-ts/lib/function";
import { fromEither, fromLeft, taskEither } from "fp-ts/lib/TaskEither";
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
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseErrorConflict,
  ResponseErrorForbiddenNotAuthorized,
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import { FiscalCode } from "italia-ts-commons/lib/strings";

import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { fromPredicate } from "fp-ts/lib/TaskEither";
import { CardPending } from "../generated/definitions/CardPending";
import { EycaCard } from "../generated/definitions/EycaCard";
import { UserCgnModel } from "../models/user_cgn";
import { UserEycaCard, UserEycaCardModel } from "../models/user_eyca_card";
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

export function GetEycaStatusHandler(
  userEycaCardModel: UserEycaCardModel,
  userCgnModel: UserCgnModel,
  eycaBetaTestUpperBoundAge: NonNegativeInteger | undefined
): IGetEycaStatusHandler {
  return async (_, fiscalCode) =>
    fromEither(isEycaEligible(fiscalCode, eycaBetaTestUpperBoundAge))
      .mapLeft<ErrorTypes>(() =>
        ResponseErrorInternal("Cannot perform user's EYCA eligibility check")
      )
      .chain(
        fromPredicate(
          isEligible => isEligible,
          () => ResponseErrorForbiddenNotAuthorized
        )
      )
      .chain(() =>
        userEycaCardModel
          .findLastVersionByModelId([fiscalCode])
          .mapLeft(() =>
            ResponseErrorInternal(
              "Error trying to retrieve user's EYCA Card status"
            )
          )
      )
      .chain<UserEycaCard>(maybeUserEycaCard =>
        fromEither(
          fromOption(
            ResponseErrorNotFound(
              "Not Found",
              "User's EYCA Card status not found"
            )
          )(maybeUserEycaCard)
        ).foldTaskEither(
          notFoundError =>
            userCgnModel
              .findLastVersionByModelId([fiscalCode])
              .mapLeft<ErrorTypes>(() =>
                ResponseErrorInternal(
                  "Error trying to retrieve user's CGN Card status"
                )
              )
              .chain(maybeUserCgn =>
                fromEither(fromOption(notFoundError)(maybeUserCgn))
              )
              .chain(
                fromPredicate(
                  userCgn => CardPending.is(userCgn.card),
                  () =>
                    ResponseErrorConflict(
                      "EYCA Card is missing while citizen is eligible to obtain it"
                    )
                )
              )
              .chain(() => fromLeft(notFoundError)),
          card => taskEither.of(card)
        )
      )
      .fold<ResponseTypes>(identity, userEycaCard =>
        ResponseSuccessJson(userEycaCard.card)
      )
      .run();
}

export function GetEycaStatus(
  userEycaCardModel: UserEycaCardModel,
  userCgnModel: UserCgnModel,
  eycaBetaTestUpperBoundAge: NonNegativeInteger | undefined
): express.RequestHandler {
  const handler = GetEycaStatusHandler(
    userEycaCardModel,
    userCgnModel,
    eycaBetaTestUpperBoundAge
  );

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    RequiredParamMiddleware("fiscalcode", FiscalCode)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
