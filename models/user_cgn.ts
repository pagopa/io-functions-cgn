import { Container } from "@azure/cosmos";
import {
  CosmosdbModelVersioned,
  RetrievedVersionedModel
} from "io-functions-commons/dist/src/utils/cosmosdb_model_versioned";
import { wrapWithKind } from "io-functions-commons/dist/src/utils/types";
import * as t from "io-ts";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import { CgnStatus } from "../generated/definitions/CgnStatus";

export const USER_CGN_COLLECTION_NAME = "user-cgns";
export const USER_CGN_MODEL_PK_FIELD = "fiscalCode" as const;

const UserCgn = t.interface({
  // The id of the user
  fiscalCode: FiscalCode,
  // the status of the CGN related to the user
  status: CgnStatus
});
export type UserCgn = t.TypeOf<typeof UserCgn>;

export const NewUserCgn = wrapWithKind(UserCgn, "INewUserCgn" as const);

export type NewUserCgn = t.TypeOf<typeof NewUserCgn>;

export const RetrievedUserCgn = wrapWithKind(
  t.intersection([UserCgn, RetrievedVersionedModel]),
  "IRetrievedUserCgn" as const
);

export type RetrievedUserCgn = t.TypeOf<typeof RetrievedUserCgn>;

export class UserCgnModel extends CosmosdbModelVersioned<
  UserCgn,
  NewUserCgn,
  RetrievedUserCgn,
  typeof USER_CGN_MODEL_PK_FIELD
> {
  /**
   * Creates a new UserCgn model
   *
   * @param container the DocumentDB container
   *
   */
  constructor(container: Container) {
    super(container, NewUserCgn, RetrievedUserCgn, USER_CGN_MODEL_PK_FIELD);
  }
}
