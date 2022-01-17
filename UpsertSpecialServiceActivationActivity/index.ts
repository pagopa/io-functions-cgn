import { ServicesAPIClient } from "../clients/services";
import { getUpsertSpecialServiceActivationActivityHandler } from "./handler";

const updateCgnStatusActivityHandler = getUpsertSpecialServiceActivationActivityHandler(
  ServicesAPIClient
);

export default updateCgnStatusActivityHandler;
