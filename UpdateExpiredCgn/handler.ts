/*
 * This function is not intended to be invoked directly. Instead it will be
 * triggered by an orchestrator function.
 *
 * Before running this sample, please:
 * - create a Durable orchestration function
 * - create a Durable HTTP starter function
 * - run 'yarn add durable-functions' from the wwwroot folder of your
 *   function app in Kudu
 */

import { Context } from "@azure/functions";
import * as date_fns from "date-fns";
import * as df from "durable-functions";
import { toError } from "fp-ts/lib/Either";
import { fromNullable, isNone } from "fp-ts/lib/Option";
import { tryCatch } from "fp-ts/lib/TaskEither";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import { StatusEnum as CgnActivatedStatusEnum } from "../generated/definitions/CgnActivatedStatus";
import { StatusEnum as CgnExpiredStatusEnum } from "../generated/definitions/CgnExpiredStatus";
import { StatusEnum as CgnRevokedStatusEnum } from "../generated/definitions/CgnRevokedStatus";
import { OrchestratorInput } from "../UpdateCgnOrchestrator";
import {
  makeUpdateCgnOrchestratorId,
  terminateOrchestratorTask
} from "../utils/orchestrators";

const finish = () => Promise.resolve(void 0);
const ORCHESTRATION_TERMINATION_REASON = "An highest priority CGN update orchestrator needs to start" as NonEmptyString;

export const getUpdateExpiredCgnHandler = (
  logPrefix: string = "UpdateExpiredCgnHandler"
) => async (context: Context): Promise<void> => {
  const today = date_fns.format(Date.now(), "yyyy-MM-dd");

  const client = df.getClient(context);
  // tslint:disable-next-line: readonly-array
  const expiredCgnUsersState = await client.readEntityState<FiscalCode[]>(
    new df.EntityId("CgnExpiration", today)
  );
  const maybeExpiredCgnUsers = fromNullable(expiredCgnUsersState.entityState);

  if (isNone(maybeExpiredCgnUsers)) {
    context.log.info(
      `${logPrefix}|No CGN expiration is scheduled for today ${today}`
    );
    return finish();
  }

  const expiredCgnUsers = maybeExpiredCgnUsers.value;
  // trigger an update orchestrator for each user's CGN that expires
  expiredCgnUsers.forEach(async fiscalCode => {
    // first we terminate other possible Cgn update orchestrators
    await terminateOrchestratorTask(
      client,
      fiscalCode,
      CgnActivatedStatusEnum.ACTIVATED,
      ORCHESTRATION_TERMINATION_REASON
    ).run();
    await terminateOrchestratorTask(
      client,
      fiscalCode,
      CgnRevokedStatusEnum.REVOKED,
      ORCHESTRATION_TERMINATION_REASON
    ).run();

    context.log.info(
      `${logPrefix}| Starting new expire orchestrator for fiscalCode=${fiscalCode.substr(
        0,
        6
      )}`
    );
    // Now we try to start Expire operation
    await tryCatch(
      () =>
        client.startNew(
          "UpdateCgnOrchestrator",
          makeUpdateCgnOrchestratorId(fiscalCode, CgnExpiredStatusEnum.EXPIRED),
          OrchestratorInput.encode({
            fiscalCode,
            newStatus: {
              status: CgnExpiredStatusEnum.EXPIRED
            }
          })
        ),
      toError
    )
      .mapLeft(err => {
        context.log.error(
          `${logPrefix}|Error while starting CGN expiration for fiscalCode=${fiscalCode.substr(
            0,
            6
          )}|ERROR=${err.message}`
        );
        return err;
      })
      .run();
  });

  return finish();
};
