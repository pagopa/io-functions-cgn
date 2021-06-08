import { Container } from "@azure/cosmos";
import { Card } from "../generated/definitions/Card";
import { RetrievedVersionedModel } from "io-functions-commons/dist/src/utils/cosmosdb_model_versioned";
import { wrapWithKind } from "io-functions-commons/dist/src/utils/types";
import * as t from "io-ts";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import { UserCardVersionedDeletable } from "./user_card_versionend_deletable";

export const USER_CGN_COLLECTION_NAME = "user-cgns";
export const USER_CGN_MODEL_PK_FIELD = "fiscalCode" as const;

const UserCgn = t.interface({
  // the CGN card related to the user
  card: Card,
  // The id of the user
  fiscalCode: FiscalCode,
  // The CGN identifier
  id: NonEmptyString
});
export type UserCgn = t.TypeOf<typeof UserCgn>;

export const NewUserCgn = wrapWithKind(UserCgn, "INewUserCgn" as const);

export type NewUserCgn = t.TypeOf<typeof NewUserCgn>;

export const RetrievedUserCgn = wrapWithKind(
  t.intersection([UserCgn, RetrievedVersionedModel]),
  "IRetrievedUserCgn" as const
);

export type RetrievedUserCgn = t.TypeOf<typeof RetrievedUserCgn>;

export class UserCgnModel extends UserCardVersionedDeletable<
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
  
  public findAll = ( fiscalCode: FiscalCode ) => {
    return super.findAll(fiscalCode, USER_CGN_COLLECTION_NAME, USER_CGN_MODEL_PK_FIELD);
  }
}
