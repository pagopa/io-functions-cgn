import { Context } from "@azure/functions";
import { TableService } from "azure-storage";
import * as date_fns from "date-fns";
import * as df from "durable-functions";
import { array, chunksOf } from "fp-ts/lib/Array";
import { isLeft, toError } from "fp-ts/lib/Either";
import { taskEither, tryCatch } from "fp-ts/lib/TaskEither";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { StatusEnum as CardActivatedStatusEnum } from "../generated/definitions/CardActivated";
import { StatusEnum as CardExpiredStatusEnum } from "../generated/definitions/CardExpired";
import { StatusEnum as CardRevokedStatusEnum } from "../generated/definitions/CardRevoked";
import { initTelemetryClient, trackException } from "../utils/appinsights";
import {
  makeUpdateCgnOrchestratorId,
  terminateUpdateCgnOrchestratorTask
} from "../utils/orchestrators";
import { getExpiredCgnUsers } from "./table";

const finish = () => Promise.resolve(void 0);

initTelemetryClient();
const ORCHESTRATION_TERMINATION_REASON = "An highest priority CGN update orchestrator needs to start" as NonEmptyString;

export const getUpdateExpiredCgnHandler = (
  tableService: TableService,
  cgnExpirationTableName: NonEmptyString,
  logPrefix: string = "UpdateExpiredCgnHandler"
) => async (context: Context): Promise<unknown> => {
  const today = date_fns.format(Date.now(), "yyyy-MM-dd");

  const errorOrExpiredCgnUsers = await getExpiredCgnUsers(
    tableService,
    cgnExpirationTableName,
    today
  ).run();

  if (isLeft(errorOrExpiredCgnUsers)) {
    context.log.verbose(
      `${logPrefix}|ERROR=${errorOrExpiredCgnUsers.value.message}`
    );
    return finish();
  }

  const expiredCgnUsers = errorOrExpiredCgnUsers.value;
  context.log.info(
    `${logPrefix}|Processing ${expiredCgnUsers.length} expired CGNs`
  );

  const client = df.getClient(context);
  // trigger an update orchestrator for each user's CGN that expires

  const tasks = expiredCgnUsers.map(
    ({ fiscalCode, activationDate, expirationDate }) =>
      // first we terminate other possible Cgn update orchestrators
      terminateUpdateCgnOrchestratorTask(
        client,
        fiscalCode,
        CardActivatedStatusEnum.ACTIVATED,
        ORCHESTRATION_TERMINATION_REASON
      )
        .chain(() =>
          terminateUpdateCgnOrchestratorTask(
            client,
            fiscalCode,
            CardRevokedStatusEnum.REVOKED,
            ORCHESTRATION_TERMINATION_REASON
          )
        )
        .chain(() => {
          context.log.info(
            `${logPrefix}| Starting new expire orchestrator for fiscalCode=${fiscalCode.substr(
              0,
              6
            )}`
          );
          // Now we try to start Expire operation
          return tryCatch(
            () =>
              client.startNew(
                "UpdateCgnOrchestrator",
                makeUpdateCgnOrchestratorId(
                  fiscalCode,
                  CardExpiredStatusEnum.EXPIRED
                ),
                {
                  fiscalCode,
                  newStatus: {
                    activation_date: activationDate,
                    expiration_date: expirationDate,
                    status: CardExpiredStatusEnum.EXPIRED
                  }
                }
              ),
            toError
          );
        })
        .mapLeft(err => {
          context.log.error(
            `${logPrefix}|Error while starting CGN expiration for fiscalCode=${fiscalCode.substr(
              0,
              6
            )}|ERROR=${err.message}`
          );
          trackException({
            exception: err,
            properties: {
              id: fiscalCode,
              name: "cgn.expire.error"
            }
          });
          return err;
        })
  );

  // tslint:disable-next-line: readonly-array
  const taskArray = [];
  const tasksChunks = chunksOf(tasks, 100);
  for (const tasksChunk of tasksChunks) {
    taskArray.push(
      array
        .sequence(taskEither)(tasksChunk)
        .run()
    );
  }
  return Promise.all([...taskArray]);
};
