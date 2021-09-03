import {
  ResponseErrorInternal,
  ResponseErrorNotFound
} from "@pagopa/ts-commons/lib/responses";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { QueueService } from "azure-storage";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import { ContinueEycaActivationInput } from "../ContinueEycaActivation/handler";
import { UserCgnModel } from "../models/user_cgn";
import { UserEycaCardModel } from "../models/user_eyca_card";

export const retrieveUserCgn = (
  userCgnModel: UserCgnModel,
  fiscalCode: FiscalCode
) =>
  pipe(
    userCgnModel.findLastVersionByModelId([fiscalCode]),
    TE.mapLeft(() =>
      ResponseErrorInternal("Error trying to retrieve user's CGN status")
    ),
    TE.chainW(maybeUserCgn =>
      pipe(
        maybeUserCgn,
        TE.fromOption(() =>
          ResponseErrorNotFound("Not Found", "User's CGN status not found")
        )
      )
    )
  );

export const retrieveUserEycaCard = (
  userEycaCardModel: UserEycaCardModel,
  fiscalCode: FiscalCode
) =>
  pipe(
    userEycaCardModel.findLastVersionByModelId([fiscalCode]),
    TE.mapLeft(() =>
      ResponseErrorInternal("Error trying to retrieve user's EYCA Card")
    ),
    TE.chainW(maybeUserEycaCard =>
      pipe(
        maybeUserEycaCard,
        TE.fromOption(() =>
          ResponseErrorNotFound("Not Found", "User's EYCA Card not found")
        )
      )
    )
  );

/**
 * Enqueue an EYCA activation's process
 */
export const getEnqueueEycaActivation = (
  queueService: QueueService,
  queueName: NonEmptyString
) => {
  const createMessage = TE.taskify(
    queueService.createMessage.bind(queueService)
  );
  return (
    input: ContinueEycaActivationInput
  ): TE.TaskEither<Error, QueueService.QueueMessageResult> => {
    // see https://github.com/Azure/Azure-Functions/issues/1091
    const message = Buffer.from(JSON.stringify(input)).toString("base64");
    return createMessage(queueName, message);
  };
};

export type EnqueueEycaActivationT = ReturnType<
  typeof getEnqueueEycaActivation
>;
