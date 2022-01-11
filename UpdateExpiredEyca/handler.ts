import { Context } from "@azure/functions";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { ExponentialRetryPolicyFilter, TableService } from "azure-storage";
import * as date_fns from "date-fns";
import * as df from "durable-functions";
import * as A from "fp-ts/lib/Array";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import { OrchestratorInput } from "../ExpireEycaOrchestrator/index";
import { StatusEnum as CardExpiredStatusEnum } from "../generated/definitions/CardExpired";
import { StatusEnum } from "../generated/definitions/CardPending";
import { initTelemetryClient, trackException } from "../utils/appinsights";
import { getExpiredCardUsers } from "../utils/card_expiration";
import {
  makeEycaOrchestratorId,
  terminateOrchestratorById
} from "../utils/orchestrators";

const finish = (): Promise<void> => Promise.resolve(void 0);

initTelemetryClient();
const ORCHESTRATION_TERMINATION_REASON = "An highest priority EYCA expire orchestrator needs to start" as NonEmptyString;

export const getUpdateExpiredEycaHandler = (
  tableService: TableService,
  eycaExpirationTableName: NonEmptyString,
  logPrefix: string = "UpdateExpiredEycaHandler"
) => async (
  context: Context
): Promise<ReadonlyArray<E.Either<Error, ReadonlyArray<string>>> | void> => {
  const today = date_fns.format(Date.now(), "yyyy-MM-dd");

  const errorOrExpiredEycaUsers = await getExpiredCardUsers(
    // using custom Exponential backoff retry policy for expired card's query operation
    tableService.withFilter(new ExponentialRetryPolicyFilter(5)),
    eycaExpirationTableName,
    today
  )();

  if (E.isLeft(errorOrExpiredEycaUsers)) {
    context.log.verbose(
      `${logPrefix}|ERROR=${errorOrExpiredEycaUsers.left.message}`
    );
    trackException({
      exception: errorOrExpiredEycaUsers.left,
      properties: {
        id: `${today}.eyca.expiration`,
        name: "eyca.expiration.error"
      },
      tagOverrides: { samplingEnabled: "false" }
    });
    return finish();
  }

  const expiredEycaUsers = errorOrExpiredEycaUsers.right;
  context.log.info(
    `${logPrefix}|Processing ${expiredEycaUsers.length} expired Eyca cards`
  );

  const client = df.getClient(context);
  // trigger an update orchestrator for each user's EYC Card that expires

  const tasks = expiredEycaUsers.map(({ fiscalCode }) =>
    // first we terminate other possible EYCA activation orchestrators
    pipe(
      terminateOrchestratorById(
        makeEycaOrchestratorId(fiscalCode, StatusEnum.PENDING),
        client,
        ORCHESTRATION_TERMINATION_REASON
      ),
      TE.chain(() => {
        context.log.info(
          `${logPrefix}| Starting new EYCA expire orchestrator for fiscalCode=${fiscalCode.substr(
            0,
            6
          )}`
        );
        // Now we try to start Expire operation
        return TE.tryCatch(
          () =>
            client.startNew(
              "ExpireEycaOrchestrator",
              makeEycaOrchestratorId(fiscalCode, CardExpiredStatusEnum.EXPIRED),
              OrchestratorInput.encode({
                fiscalCode
              })
            ),
          E.toError
        );
      }),
      TE.mapLeft(err => {
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
            name: "eyca.expiration.error"
          },
          tagOverrides: { samplingEnabled: "false" }
        });
        return err;
      })
    )
  );

  // eslint-disable-next-line functional/prefer-readonly-type
  const results = [];
  const tasksChunks = A.chunksOf(100)(tasks);
  for (const tasksChunk of tasksChunks) {
    // eslint-disable-next-line functional/prefer-readonly-type
    // eslint-disable-next-line functional/immutable-data
    results.push(await A.sequence(TE.ApplicativePar)(tasksChunk)());
  }
  return results;
};
