import { Context } from "@azure/functions";
import { fromOption, toError } from "fp-ts/lib/Either";
import { identity } from "fp-ts/lib/function";
import { fromEither, tryCatch } from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import { UserEycaCardModel } from "../models/user_eyca_card";
import { extractEycaExpirationDate } from "../utils/cgn_checks";
import { genRandomCardCode } from "../utils/cgnCode";
import { errorsToError } from "../utils/conversions";

export const ActivityInput = t.interface({
  fiscalCode: FiscalCode
});

export type ActivityInput = t.TypeOf<typeof ActivityInput>;

// Activity result
const ActivityResultSuccess = t.interface({
  kind: t.literal("SUCCESS")
});

type ActivityResultSuccess = t.TypeOf<typeof ActivityResultSuccess>;

const ActivityResultFailure = t.interface({
  kind: t.literal("FAILURE"),
  reason: t.string
});

type ActivityResultFailure = t.TypeOf<typeof ActivityResultFailure>;

export const ActivityResult = t.taggedUnion("kind", [
  ActivityResultSuccess,
  ActivityResultFailure
]);

export type ActivityResult = t.TypeOf<typeof ActivityResult>;

const failure = (context: Context, logPrefix: string) => (
  err: Error,
  description: string = ""
) => {
  const logMessage =
    description === ""
      ? `${logPrefix}|FAILURE=${err.message}`
      : `${logPrefix}|${description}|FAILURE=${err.message}`;
  context.log.info(logMessage);
  return ActivityResultFailure.encode({
    kind: "FAILURE",
    reason: err.message
  });
};

const success = () =>
  ActivityResultSuccess.encode({
    kind: "SUCCESS"
  });

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
                  expiration_date: expirationDate
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
