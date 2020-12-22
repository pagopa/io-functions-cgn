// tslint:disable: no-duplicate-string object-literal-sort-keys

import { format } from "date-fns";
import { MessageContent } from "io-functions-commons/dist/generated/definitions/MessageContent";
import { CgnRevokedStatus } from "../generated/definitions/CgnRevokedStatus";
import { CgnStatus } from "../generated/definitions/CgnStatus";
import { assertNever } from "./types";

export const MESSAGES = {
  CgnRevokedStatus: (status: CgnRevokedStatus) =>
    ({
      subject: "La tua Carta Giovani Nazionale è stata Revocata",
      markdown: `
A seguito di una segnalazione la tua Carta Giovani Nazionale è stata **revocata** in data **${format(
        status.revokation_date,
        "dd-MM-yyyy"
      )}** con la seguente motivazione:
${status.motivation}
`
    } as MessageContent)
};

export const getMessage = (
  messageType: keyof typeof MESSAGES,
  cgnStatus: CgnStatus
): MessageContent => {
  // tslint:disable-next-line: no-small-switch
  switch (messageType) {
    case "CgnRevokedStatus":
      return MESSAGES[messageType](cgnStatus as CgnRevokedStatus);
    default:
      return assertNever(messageType);
  }
};
