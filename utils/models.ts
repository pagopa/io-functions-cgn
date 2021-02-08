import { fromOption } from "fp-ts/lib/Either";
import { fromEither } from "fp-ts/lib/TaskEither";
import {
  IResponseErrorInternal,
  IResponseErrorNotFound,
  ResponseErrorInternal,
  ResponseErrorNotFound
} from "italia-ts-commons/lib/responses";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import { UserCgnModel } from "../models/user_cgn";

export const retrieveUserCgn = (
  userCgnModel: UserCgnModel,
  fiscalCode: FiscalCode
) =>
  userCgnModel
    .findLastVersionByModelId([fiscalCode])
    .mapLeft<IResponseErrorInternal | IResponseErrorNotFound>(() =>
      ResponseErrorInternal("Error trying to retrieve user's CGN status")
    )
    .chain(maybeUserCgn =>
      fromEither(
        fromOption(
          ResponseErrorNotFound("Not Found", "User's CGN status not found")
        )(maybeUserCgn)
      )
    );
