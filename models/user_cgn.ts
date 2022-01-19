import { Container } from "@azure/cosmos";
import { RetrievedVersionedModel } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model_versioned";
import { wrapWithKind } from "@pagopa/io-functions-commons/dist/src/utils/types";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as t from "io-ts";
import { Card } from "../generated/definitions/Card";
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

export const DeleteUserCgn = wrapWithKind(UserCgn, "IDeleteUserCgn" as const);

export type DeleteUserCgn = t.TypeOf<typeof DeleteUserCgn>;

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

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  public findAllCgnCards(fiscalCode: FiscalCode) {
    return this.findAll(fiscalCode, USER_CGN_MODEL_PK_FIELD);
  }
}
