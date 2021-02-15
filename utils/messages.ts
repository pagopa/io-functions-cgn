// tslint:disable: no-duplicate-string object-literal-sort-keys

import { format } from "date-fns";
import { MessageContent } from "io-functions-commons/dist/generated/definitions/MessageContent";
import { Card } from "../generated/definitions/Card";
import { CardActivated } from "../generated/definitions/CardActivated";
import { CardRevoked } from "../generated/definitions/CardRevoked";
import { assertNever } from "./types";

export const MESSAGES = {
  CardRevoked: (status: CardRevoked) =>
    ({
      subject: "La tua Carta Giovani Nazionale è stata revocata",
      markdown: `
A seguito di una segnalazione la tua Carta Giovani Nazionale è stata **revocata** in data **${format(
        status.revocation_date,
        "dd-MM-yyyy"
      )}** con la seguente motivazione:
${status.revocation_reason}
`
    } as MessageContent),
  CardActivated: (_: CardActivated) =>
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

export const getMessage = (
  messageType: keyof typeof MESSAGES,
  card: Card
): MessageContent => {
  switch (messageType) {
    case "CardRevoked":
      // tslint:disable-next-line: no-useless-cast
      return MESSAGES[messageType](card as CardRevoked);
    case "CardActivated":
      // tslint:disable-next-line: no-useless-cast
      return MESSAGES[messageType](card as CardActivated);
    case "CardExpired":
      return MESSAGES[messageType]();
    default:
      return assertNever(messageType);
  }
};
