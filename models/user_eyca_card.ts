import { Container } from "@azure/cosmos";
import { RetrievedVersionedModel } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model_versioned";
import { wrapWithKind } from "@pagopa/io-functions-commons/dist/src/utils/types";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import * as t from "io-ts";
import { EycaCard } from "../generated/definitions/EycaCard";
import { UserCardVersionedDeletable } from "./user_card_versionend_deletable";

export const USER_EYCA_CARD_COLLECTION_NAME = "user-eyca-cards";
export const USER_EYCA_CARD_MODEL_PK_FIELD = "fiscalCode" as const;

const UserEycaCard = t.interface({
  // the EYCA card related to the user
  card: EycaCard,
  // The id of the user
  fiscalCode: FiscalCode
});
export type UserEycaCard = t.TypeOf<typeof UserEycaCard>;

export const NewUserEycaCard = wrapWithKind(
  UserEycaCard,
  "INewUserEycaCard" as const
);

export type NewUserEycaCard = t.TypeOf<typeof NewUserEycaCard>;

export const RetrievedUserEycaCard = wrapWithKind(
  t.intersection([UserEycaCard, RetrievedVersionedModel]),
  "IRetrievedUserEycaCard" as const
);

export type RetrievedUserEycaCard = t.TypeOf<typeof RetrievedUserEycaCard>;

export class UserEycaCardModel extends UserCardVersionedDeletable<
  UserEycaCard,
  NewUserEycaCard,
  RetrievedUserEycaCard,
  typeof USER_EYCA_CARD_MODEL_PK_FIELD
> {
  /**
   * Creates a new UserEycaCard model
   *
   * @param container the DocumentDB container
   *
   */
  constructor(container: Container) {
    super(
      container,
      NewUserEycaCard,
      RetrievedUserEycaCard,
      USER_EYCA_CARD_MODEL_PK_FIELD
    );
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  public findAllEycaCards(fiscalCode: FiscalCode) {
    return this.findAll(
      fiscalCode,
      USER_EYCA_CARD_COLLECTION_NAME,
      USER_EYCA_CARD_MODEL_PK_FIELD
    );
  }
}
