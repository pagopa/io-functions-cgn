import { AzureFunction, Context } from "@azure/functions";
import { getConfigOrThrow } from "../utils/config";
import { Failure } from "../utils/errors";
import { ContinueEycaActivationHandler } from "./handler";
const config = getConfigOrThrow();

export const index: AzureFunction = (
  context: Context,
  message: unknown
): Promise<Failure | string> =>
  ContinueEycaActivationHandler(context, message, config.EYCA_UPPER_BOUND_AGE);

export default index;
