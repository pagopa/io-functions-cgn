import * as df from "durable-functions";
import { IEntityFunctionContext } from "durable-functions/lib/src/classes";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { FiscalCode } from "italia-ts-commons/lib/strings";

const EntityInput = t.interface({
  fiscalCode: FiscalCode
});

type EntityInput = t.TypeOf<typeof EntityInput>;

export const handler = (context: IEntityFunctionContext) => {
  // tslint:disable-next-line: readonly-array
  const currentState = context.df.getState(() => []) as FiscalCode[];
  switch (context.df.operationName) {
    case "add":
      const errorOrEntityInput = EntityInput.decode(context.df.getInput());
      if (isLeft(errorOrEntityInput)) {
        context.df.return(new Error("Cannot decode entity input"));
        break;
      }
      currentState.push(errorOrEntityInput.value.fiscalCode);
      context.df.setState(currentState);
      break;
    case "reset":
      context.df.setState([]);
      break;
    case "get":
      context.df.return(currentState);
      break;
    case "terminate":
      context.df.destructOnExit();
      break;
  }
};

export const index = df.entity(handler);
