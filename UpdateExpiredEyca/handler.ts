import { Context } from "@azure/functions";
import { TableService } from "azure-storage";
import * as date_fns from "date-fns";
import * as df from "durable-functions";
import { array, chunksOf } from "fp-ts/lib/Array";
import { Either, isLeft, toError } from "fp-ts/lib/Either";
import { taskEither, tryCatch } from "fp-ts/lib/TaskEither";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { OrchestratorInput } from "../ExpireEycaOrchestrator/index";
import { StatusEnum as CardExpiredStatusEnum } from "../generated/definitions/CardExpired";
import { StatusEnum } from "../generated/definitions/CardPending";
import { initTelemetryClient, trackException } from "../utils/appinsights";
import { getExpiredCardUsers } from "../utils/card_expiration";
import {
  makeEycaOrchestratorId,
  terminateOrchestratorById
} from "../utils/orchestrators";

const finish = () => Promise.resolve(void 0);

initTelemetryClient();
const ORCHESTRATION_TERMINATION_REASON = "An highest priority EYCA expire orchestrator needs to start" as NonEmptyString;

export const getUpdateExpiredEycaHandler = (
  tableService: TableService,
  eycaExpirationTableName: NonEmptyString,
  logPrefix: string = "UpdateExpiredEycaHandler"
) => async (
  context: Context
): Promise<ReadonlyArray<Either<Error, ReadonlyArray<string>>> | void> => {
  const today = date_fns.format(Date.now(), "yyyy-MM-dd");

  const errorOrExpiredEycaUsers = await getExpiredCardUsers(
    tableService,
    eycaExpirationTableName,
    today
  ).run();

  if (isLeft(errorOrExpiredEycaUsers)) {
    context.log.verbose(
      `${logPrefix}|ERROR=${errorOrExpiredEycaUsers.value.message}`
    );
    return finish();
  }

  const expiredEycaUsers = errorOrExpiredEycaUsers.value;
  context.log.info(
    `${logPrefix}|Processing ${expiredEycaUsers.length} expired Eyca cards`
  );

  const client = df.getClient(context);
  // trigger an update orchestrator for each user's EYC Card that expires

  const tasks = expiredEycaUsers.map(({ fiscalCode }) =>
    // first we terminate other possible EYCA activation orchestrators
    terminateOrchestratorById(
      makeEycaOrchestratorId(fiscalCode, StatusEnum.PENDING),
      client,
      ORCHESTRATION_TERMINATION_REASON
    )
      .chain(() => {
        context.log.info(
          `${logPrefix}| Starting new EYCA expire orchestrator for fiscalCode=${fiscalCode.substr(
            0,
            6
          )}`
        );
        // Now we try to start Expire operation
        return tryCatch(
          () =>
            client.startNew(
              "ExpireEycaOrchestrator",
              makeEycaOrchestratorId(fiscalCode, CardExpiredStatusEnum.EXPIRED),
              OrchestratorInput.encode({
                fiscalCode
              })
            ),
          toError
        );
      })
      .mapLeft(err => {
        context.log.error(
          `${logPrefix}|Error while starting EYCA expiration for fiscalCode=${fiscalCode.substr(
            0,
            6
          )}|ERROR=${err.message}`
        );
        trackException({
          exception: err,
          properties: {
            id: fiscalCode,
            name: "eyca.expire.error"
          },
          tagOverrides: { samplingEnabled: "false" }
        });
        return err;
      })
  );

  // tslint:disable-next-line: readonly-array
  const results = [];
  const tasksChunks = chunksOf(tasks, 100);
  for (const tasksChunk of tasksChunks) {
    results.push(
      await array
        .sequence(taskEither)(tasksChunk)
        .run()
    );
  }
  return results;
};
