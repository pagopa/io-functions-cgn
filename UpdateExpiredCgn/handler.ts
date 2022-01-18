import { Context } from "@azure/functions";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { ExponentialRetryPolicyFilter, TableService } from "azure-storage";
import * as date_fns from "date-fns";
import * as df from "durable-functions";
import * as A from "fp-ts/lib/Array";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import { StatusEnum as CardActivatedStatusEnum } from "../generated/definitions/CardActivated";
import { StatusEnum as CardExpiredStatusEnum } from "../generated/definitions/CardExpired";
import { StatusEnum as CardRevokedStatusEnum } from "../generated/definitions/CardRevoked";
import { OrchestratorInput } from "../UpdateCgnOrchestrator/handler";
import { initTelemetryClient, trackException } from "../utils/appinsights";
import { getExpiredCardUsers } from "../utils/card_expiration";
import { toHash } from "../utils/hash";
import {
  makeUpdateCgnOrchestratorId,
  terminateUpdateCgnOrchestratorTask
} from "../utils/orchestrators";

const finish = (): Promise<void> => Promise.resolve(void 0);

initTelemetryClient();
const ORCHESTRATION_TERMINATION_REASON = "An highest priority CGN update orchestrator needs to start" as NonEmptyString;

export const getUpdateExpiredCgnHandler = (
  tableService: TableService,
  cgnExpirationTableName: NonEmptyString,
  logPrefix: string = "UpdateExpiredCgnHandler"
) => async (context: Context): Promise<unknown> => {
  const today = date_fns.format(Date.now(), "yyyy-MM-dd");

  const errorOrExpiredCgnUsers = await getExpiredCardUsers(
    // using custom Exponential backoff retry policy for expired card's query operation
    tableService.withFilter(new ExponentialRetryPolicyFilter(5)),
    cgnExpirationTableName,
    today
  )();

  if (E.isLeft(errorOrExpiredCgnUsers)) {
    context.log.verbose(
      `${logPrefix}|ERROR=${errorOrExpiredCgnUsers.left.message}`
    );
    trackException({
      exception: errorOrExpiredCgnUsers.left,
      properties: {
        id: `${today}.cgn.expiration`,
        name: "cgn.expiration.error"
      },
      tagOverrides: { samplingEnabled: "false" }
    });
    return finish();
  }

  const expiredCgnUsers = errorOrExpiredCgnUsers.right;
  context.log.info(
    `${logPrefix}|Processing ${expiredCgnUsers.length} expired CGNs`
  );

  const client = df.getClient(context);
  // trigger an update orchestrator for each user's CGN that expires

  const tasks = expiredCgnUsers.map(
    ({ fiscalCode, activationDate, expirationDate }) =>
      // first we terminate other possible Cgn update orchestrators
      pipe(
        terminateUpdateCgnOrchestratorTask(
          client,
          fiscalCode,
          CardActivatedStatusEnum.ACTIVATED,
          ORCHESTRATION_TERMINATION_REASON
        ),
        TE.chain(() =>
          terminateUpdateCgnOrchestratorTask(
            client,
            fiscalCode,
            CardRevokedStatusEnum.REVOKED,
            ORCHESTRATION_TERMINATION_REASON
          )
        ),
        TE.chain(() => {
          context.log.info(
            `${logPrefix}| Starting new expire orchestrator for fiscalCode=${toHash(
              fiscalCode
            )}`
          );
          // Now we try to start Expire operation
          return TE.tryCatch(
            () =>
              client.startNew(
                "UpdateCgnOrchestrator",
                makeUpdateCgnOrchestratorId(
                  fiscalCode,
                  CardExpiredStatusEnum.EXPIRED
                ),
                OrchestratorInput.encode({
                  fiscalCode,
                  newStatusCard: {
                    activation_date: activationDate,
                    expiration_date: expirationDate,
                    status: CardExpiredStatusEnum.EXPIRED
                  }
                })
              ),
            E.toError
          );
        }),
        TE.mapLeft(err => {
          context.log.error(
            `${logPrefix}|Error while starting CGN expiration for fiscalCode=${toHash(
              fiscalCode
            )}|ERROR=${err.message}`
          );
          trackException({
            exception: err,
            properties: {
              id: fiscalCode,
              name: "cgn.expiration.error"
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
