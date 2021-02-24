import * as express from "express";

import { Context } from "@azure/functions";
import { fromOption } from "fp-ts/lib/Either";
import { identity } from "fp-ts/lib/function";
import { fromEither } from "fp-ts/lib/TaskEither";
import { ContextMiddleware } from "io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredParamMiddleware } from "io-functions-commons/dist/src/utils/middlewares/required_param";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorConflict,
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseErrorConflict,
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import { FiscalCode } from "italia-ts-commons/lib/strings";

import { EycaCard } from "../generated/definitions/EycaCard";
import { UserEycaCardModel } from "../models/user_eyca_card";
import { isEycaEligible } from "../utils/cgn_checks";

type ErrorTypes =
  | IResponseErrorNotFound
  | IResponseErrorInternal
  | IResponseErrorConflict;
type ResponseTypes = IResponseSuccessJson<EycaCard> | ErrorTypes;

type IGetEycaStatusHandler = (
  context: Context,
  fiscalCode: FiscalCode
) => Promise<ResponseTypes>;

export function GetEycaStatusHandler(
  userEycaCardModel: UserEycaCardModel
): IGetEycaStatusHandler {
  return async (_, fiscalCode) => {
    return userEycaCardModel
      .findLastVersionByModelId([fiscalCode])
      .mapLeft<ErrorTypes>(() =>
        ResponseErrorInternal(
          "Error trying to retrieve user's EYCA Card status"
        )
      )
      .chain(maybeUserEycaCard =>
        fromEither(
          fromOption(
            ResponseErrorNotFound(
              "Not Found",
              "User's EYCA Card status not found"
            )
          )(maybeUserEycaCard)
        ).mapLeft(notFoundError =>
          isEycaEligible(fiscalCode).fold<ErrorTypes>(
            () =>
              ResponseErrorInternal(
                "Cannot perform user's EYCA eligibility check"
              ),
            isEligible =>
              isEligible
                ? ResponseErrorConflict(
                    "EYCA Card is missing while citizen is eligible to obtain it"
                  )
                : notFoundError
          )
        )
      )
      .fold<ResponseTypes>(identity, userEycaCard =>
        ResponseSuccessJson(userEycaCard.card)
      )
      .run();
  };
}

export function GetEycaStatus(
  userEycaCardModel: UserEycaCardModel
): express.RequestHandler {
  const handler = GetEycaStatusHandler(userEycaCardModel);

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    RequiredParamMiddleware("fiscalcode", FiscalCode)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
