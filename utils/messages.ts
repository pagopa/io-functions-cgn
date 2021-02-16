// tslint:disable: no-duplicate-string object-literal-sort-keys

import { format } from "date-fns";
import { MessageContent } from "io-functions-commons/dist/generated/definitions/MessageContent";
import { Card } from "../generated/definitions/Card";
import { CardActivated } from "../generated/definitions/CardActivated";
import { CardExpired } from "../generated/definitions/CardExpired";
import { CardPending } from "../generated/definitions/CardPending";
import { CardRevoked } from "../generated/definitions/CardRevoked";
import { assertNever } from "./types";

export const MESSAGES = {
  CardRevoked: (card: CardRevoked) =>
    ({
      subject: "La tua Carta Giovani Nazionale è stata revocata",
      markdown: `
A seguito di una segnalazione la tua Carta Giovani Nazionale è stata **revocata** in data **${format(
        card.revocation_date,
        "dd-MM-yyyy"
      )}** con la seguente motivazione:
${card.revocation_reason}
`
    } as MessageContent),
  CardActivated: () =>
    ({
      subject: "La tua Carta Nazionale Giovani è attiva",
      markdown: `A seguito della tua richiesta di attivazione, la tua Carta Giovani Nazionale è
**attiva** e pronta all' utilizzo.
`
    } as MessageContent),
  CardExpired: () =>
    ({
      subject: "La tua Carta Nazionale Giovani è scaduta",
      markdown: `
A seguito del compimento del tuo trentaseiesimo anno di età, la carta è **scaduta**
in quanto non rientri nei requisiti per il suo utilizzo.      
`
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
  if (CardPending.is(card)) {
    throw new Error("Unexpected Card status");
  }

  return assertNever(card);
};
