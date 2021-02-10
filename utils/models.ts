import { QueueService } from "azure-storage";
import { fromOption } from "fp-ts/lib/Either";
import { toString } from "fp-ts/lib/function";
import { fromEither, TaskEither, taskify } from "fp-ts/lib/TaskEither";
import {
  IResponseErrorInternal,
  IResponseErrorNotFound,
  ResponseErrorInternal,
  ResponseErrorNotFound
} from "italia-ts-commons/lib/responses";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
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

/**
 * Enqueue an EYCA activation's process
 */
export const getEnqueueEycaActivation = (
  queueService: QueueService,
  queueName: NonEmptyString
) => {
  const createMessage = taskify(queueService.createMessage.bind(queueService));
  return (
    input: string
  ): TaskEither<IResponseErrorInternal, QueueService.QueueMessageResult> => {
    // see https://github.com/Azure/Azure-Functions/issues/1091
    const message = Buffer.from(JSON.stringify(input)).toString("base64");
    return createMessage(queueName, message).mapLeft(err =>
      ResponseErrorInternal(`Cannot enqueue bonus activation: ${toString(err)}`)
    );
  };
};

export type EnqueueEycaActivationT = ReturnType<
  typeof getEnqueueEycaActivation
>;
