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
import { TableService } from "azure-storage";
import * as date_fns from "date-fns";
import * as df from "durable-functions";
import { isLeft } from "fp-ts/lib/Either";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { StatusEnum as CgnCanceledStatusEnum } from "../generated/definitions/CgnCanceledStatus";
import { OrchestratorInput } from "../UpdateCgnOrchestrator";
import { makeUpdateCgnOrchestratorId } from "../utils/orchestrators";
import { getExpiredCgnUsers } from "./table";

const finish = () => Promise.resolve(void 0);

export const getUpdateExpiredCgnHandler = (
  tableService: TableService,
  cgnExpirationTableName: NonEmptyString,
  logPrefix: string = "UpdateExpiredCgnHandler"
) => async (context: Context): Promise<void> => {
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
    `${logPrefix}|Processing ${expiredCgnUsers.size} expired CGNs`
  );
  // trigger an update orchestrator for each user's CGN that expires
  expiredCgnUsers.forEach(
    async fiscalCode =>
      await df.getClient(context).startNew(
        "UpdateCgnOrchestrator",
        makeUpdateCgnOrchestratorId(fiscalCode, CgnCanceledStatusEnum.CANCELED),
        OrchestratorInput.encode({
          fiscalCode,
          newStatus: {
            status: CgnCanceledStatusEnum.CANCELED
          }
        })
      )
  );

  return Promise.resolve(void 0);
};
