import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { addYears } from "date-fns";
import { CosmosResource } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";

export const now = new Date();

export const cgnActivatedDates = {
  activation_date: now,
  expiration_date: addYears(now, 2)
};

export const aFiscalCode = "DNLLSS99S20H501F" as FiscalCode;

// CosmosResourceMetadata
export const aCosmosResourceMetadata: Omit<CosmosResource, "id"> = {
  _etag: "_etag",
  _rid: "_rid",
  _self: "_self",
  _ts: 1
};
