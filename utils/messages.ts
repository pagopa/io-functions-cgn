// tslint:disable: no-duplicate-string object-literal-sort-keys

import { format } from "date-fns";
import { MessageContent } from "io-functions-commons/dist/generated/definitions/MessageContent";
import { CgnActivatedStatus } from "../generated/definitions/CgnActivatedStatus";
import { CgnRevokedStatus } from "../generated/definitions/CgnRevokedStatus";
import { CgnStatus } from "../generated/definitions/CgnStatus";
import { assertNever } from "./types";

export const MESSAGES = {
  CgnRevokedStatus: (status: CgnRevokedStatus) =>
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
  CgnActivatedStatus: (_: CgnActivatedStatus) =>
    ({
      subject: "La tua Carta Nazionale Giovani è attiva",
      markdown: `A seguito della tua richiesta di attivazione, la tua Carta Giovani Nazionale è
**attiva** e pronta all' utilizzo.
`
    } as MessageContent),
  CgnExpiredStatus: () =>
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
  cgnStatus: CgnStatus
): MessageContent => {
  switch (messageType) {
    case "CgnRevokedStatus":
      // tslint:disable-next-line: no-useless-cast
      return MESSAGES[messageType](cgnStatus as CgnRevokedStatus);
    case "CgnActivatedStatus":
      // tslint:disable-next-line: no-useless-cast
      return MESSAGES[messageType](cgnStatus as CgnActivatedStatus);
    case "CgnExpiredStatus":
      return MESSAGES[messageType]();
    default:
      return assertNever(messageType);
  }
};
