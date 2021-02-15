import { Context } from "@azure/functions";
import { fromOption, toError } from "fp-ts/lib/Either";
import { identity } from "fp-ts/lib/function";
import { fromEither, tryCatch } from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import { StatusEnum } from "../generated/definitions/CardActivated";
import { UserEycaCardModel } from "../models/user_eyca_card";
import { ActivityResult, failure, success } from "../utils/activity";
import { extractEycaExpirationDate } from "../utils/cgn_checks";
import { genRandomCardCode } from "../utils/cgnCode";
import { errorsToError } from "../utils/conversions";

export const ActivityInput = t.interface({
  fiscalCode: FiscalCode
});

export type ActivityInput = t.TypeOf<typeof ActivityInput>;

// this must be replaced by calling EYCA APIs
const genEycaCardCode = () => tryCatch(() => genRandomCardCode(), toError);

export const getSuccessEycaActivationActivityHandler = (
  userEycaCardModel: UserEycaCardModel,
  logPrefix: string = "SuccessEycaActivationActivityHandler"
) => (context: Context, input: unknown): Promise<ActivityResult> => {
  const fail = failure(context, logPrefix);
  return fromEither(ActivityInput.decode(input))
    .mapLeft(errs => fail(errorsToError(errs), "Cannot decode Activity Input"))
    .chain(({ fiscalCode }) =>
      userEycaCardModel
        .findLastVersionByModelId([fiscalCode])
        .mapLeft(() =>
          fail(
            new Error("Cannot retrieve EYCA card for the provided fiscalCode")
          )
        )
        .chain(maybeEycaCard =>
          fromEither(
            fromOption(
              fail(new Error("No EYCA card found for the provided fiscalCode"))
            )(maybeEycaCard)
          )
        )
        .chain(eycaCard =>
          fromEither(extractEycaExpirationDate(fiscalCode))
            .chain(expirationDate =>
              genEycaCardCode().map(cardNumber => ({
                ...eycaCard,
                cardStatus: {
                  activation_date: new Date(),
                  card_number: cardNumber,
                  expiration_date: expirationDate,
                  status: StatusEnum.ACTIVATED
                }
              }))
            )
            .mapLeft(() =>
              fail(
                new Error(
                  "Cannot provide all informations for a new EYCA card related the provided fiscalCode"
                )
              )
            )
        )
    )
    .chain(_ =>
      userEycaCardModel.update(_).bimap(
        err => fail(toError(err), "Cannot update EYCA card"),
        () => success()
      )
    )
    .fold<ActivityResult>(identity, identity)
    .run();
};
