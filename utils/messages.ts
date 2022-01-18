/* eslint-disable sonarjs/no-duplicate-string, sort-keys */
import { MessageContent } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageContent";
import { format } from "date-fns";
import { Card } from "../generated/definitions/Card";
import { CardActivated } from "../generated/definitions/CardActivated";
import { CardExpired } from "../generated/definitions/CardExpired";
import { CardPending } from "../generated/definitions/CardPending";
import { CardPendingDelete } from "../generated/definitions/CardPendingDelete";
import { CardRevoked } from "../generated/definitions/CardRevoked";
import { assertNever } from "./types";

export const MESSAGES = {
  CardRevoked: (card: CardRevoked): MessageContent =>
    ({
      subject: "La tua carta è stata revocata",
      markdown: `
Ti avvisiamo che la tua Carta Giovani Nazionale è stata revocata il giorno ${format(
        card.revocation_date,
        "dd-MM-yyyy"
      )} per ${card.revocation_reason}.
            
Non sarà più possibile utilizzare la carta né nei punti fisici né online.`
    } as MessageContent),
  CardActivated: (): MessageContent =>
    ({
      subject: "La tua Carta Giovani è attiva!",
      markdown: `Buone notizie! **La tua Carta Giovani Nazionale è attiva** e la potrai trovare all’interno della sezione Portafoglio.

Ti ricordiamo che solo tu puoi usufruire degli sconti presentando la Carta presso gli esercenti fisici aderenti, oppure inserendo i codici nell’apposito campo presso gli esercenti aderenti online.

La Carta Giovani Nazionale sarà valida da oggi fino al compimento dei 36 anni. Inizia subito a usarla!
`
    } as MessageContent),
  CardExpired: (): MessageContent =>
    ({
      subject: "La tua Carta Giovani Nazionale è scaduta",
      markdown: `Ti avvisiamo che da oggi non è più possibile utilizzare la tua Carta Giovani Nazionale.

Grazie per aver partecipato all'iniziativa!`
    } as MessageContent)
};

export const getMessage = (card: Card): MessageContent => {
  if (CardRevoked.is(card)) {
    return MESSAGES.CardRevoked(card);
  }
  if (CardActivated.is(card)) {
    return MESSAGES.CardActivated();
  }
  if (CardExpired.is(card)) {
    return MESSAGES.CardExpired();
  }
  if (CardPending.is(card) || CardPendingDelete.is(card)) {
    throw new Error("Unexpected Card status");
  }

  return assertNever(card);
};

export const getEycaExpirationMessage = (): MessageContent =>
  ({
    subject: "La tua Carta EYCA è scaduta",
    markdown: `Ti avvisiamo che da oggi non è più possibile utilizzare la tua Carta Giovani Nazionale per acquisti sul circuito EYCA.

La Carta rimane valida per gli acquisti in Italia!`
  } as MessageContent);
export const getErrorMessage = (): MessageContent =>
  ({
    subject: "Abbiamo riscontrato dei problemi",
    markdown: `
Purtroppo, non siamo riusciti a emettere la tua Carta.
Ti chiediamo di riprovare.

Ci scusiamo per il disagio.
`
  } as MessageContent);
