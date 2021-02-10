// tslint:disable: no-duplicate-string object-literal-sort-keys

import { format } from "date-fns";
import { MessageContent } from "io-functions-commons/dist/generated/definitions/MessageContent";
import { CardActivatedStatus } from "../generated/definitions/CardActivatedStatus";
import { CardRevokedStatus } from "../generated/definitions/CardRevokedStatus";
import { CardStatus } from "../generated/definitions/CardStatus";
import { assertNever } from "./types";

export const MESSAGES = {
  CardRevokedStatus: (status: CardRevokedStatus) =>
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
  CardActivatedStatus: (_: CardActivatedStatus) =>
    ({
      subject: "La tua Carta Nazionale Giovani è attiva",
      markdown: `A seguito della tua richiesta di attivazione, la tua Carta Giovani Nazionale è
**attiva** e pronta all' utilizzo.
`
    } as MessageContent),
  CardExpiredStatus: () =>
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
  cardStatus: CardStatus
): MessageContent => {
  switch (messageType) {
    case "CardRevokedStatus":
      // tslint:disable-next-line: no-useless-cast
      return MESSAGES[messageType](cardStatus as CardRevokedStatus);
    case "CardActivatedStatus":
      // tslint:disable-next-line: no-useless-cast
      return MESSAGES[messageType](cardStatus as CardActivatedStatus);
    case "CardExpiredStatus":
      return MESSAGES[messageType]();
    default:
      return assertNever(messageType);
  }
};
