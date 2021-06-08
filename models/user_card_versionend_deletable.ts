import { CosmosdbModelVersioned, RetrievedVersionedModel } from "io-functions-commons/dist/src/utils/cosmosdb_model_versioned";
import { Container, ItemDefinition, SqlQuerySpec } from "@azure/cosmos";
import * as t from "io-ts";
import { rights } from "fp-ts/lib/Array";
import { toError } from "fp-ts/lib/Either";
import { tryCatch } from "fp-ts/lib/TaskEither";
import { asyncIteratorToArray, flattenAsyncIterator } from "io-functions-commons/dist/src/utils/async";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";


export abstract class UserCardVersionedDeletable<T, TN extends Readonly<T>, TR extends Readonly<T & RetrievedVersionedModel>, ModelIdKey extends keyof T, PartitionKey extends keyof T = ModelIdKey> extends CosmosdbModelVersioned<T, TN, TR, ModelIdKey, PartitionKey> {

    private createGetAllCardQuery = (fiscalCode: FiscalCode, cardTableName: string | NonEmptyString, cardPkField: string | NonEmptyString): SqlQuerySpec => {
        return {
          parameters: [
            {
              name: "@fiscalCode",
              value: fiscalCode
            }
          ],
          query: `select * from ${cardTableName} as c where c.${cardPkField} = @fiscalCode`
        }
      }
      
    public deleteVersion = (
        fiscalCode: FiscalCode,
        documentId: NonEmptyString
      ) => {
        return tryCatch(
          () => this.container.item(documentId, fiscalCode).delete(),
          toError
        ).map(_ => _.item.id);
      }
      

    protected findAll = (
    fiscalCode: FiscalCode,
    cardTableName: string | NonEmptyString, 
    cardPkField: string | NonEmptyString
  ) => {
    return tryCatch(
      () =>
        asyncIteratorToArray(
          flattenAsyncIterator(
            this.getQueryIterator(this.createGetAllCardQuery(fiscalCode, cardTableName, cardPkField))[Symbol.asyncIterator]()
          )
        ),
      toError
    )
    .map(_ => Array.from(_))
    .map(_ => rights(_));
  }
}