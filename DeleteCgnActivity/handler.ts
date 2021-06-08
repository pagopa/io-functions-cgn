import { array } from "fp-ts/lib/Array";
import { Context } from "@azure/functions";
import { identity } from "fp-ts/lib/function";
import { fromEither, taskEither } from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import { RetrievedUserCgn, UserCgnModel } from "../models/user_cgn";
import { ActivityResultFailure, ActivityResultSuccess as CommonActivityResultSuccess, failure } from "../utils/activity";
import { errorsToError } from "../utils/conversions";

export const ActivityInput = t.interface({
  fiscalCode: FiscalCode
});

export type ActivityInput = t.TypeOf<typeof ActivityInput>;

export const DeleteCgnActivityResultSuccess = t.intersection([CommonActivityResultSuccess,t.interface({cards: t.readonlyArray(RetrievedUserCgn)})]);

export type DeleteCgnActivityResultSuccess = t.TypeOf<typeof DeleteCgnActivityResultSuccess>;

export const DeleteCgnActivityResult = t.taggedUnion("kind", [
  DeleteCgnActivityResultSuccess,
  ActivityResultFailure
]); 

export type DeleteCgnActivityResult = t.TypeOf<typeof DeleteCgnActivityResult>;

/*
 * have to read the expire data first and then have to return this data for bakcup
 */
export const getDeleteCgnActivityHandler = (
  userCgnModel: UserCgnModel,
  logPrefix: string = "DeleteCgnActivity"
) => (context: Context, input: unknown): Promise<DeleteCgnActivityResult> => {
    const fail = failure(context, logPrefix);

    return fromEither(ActivityInput.decode(input))
      .mapLeft(errs => fail(errorsToError(errs), "Cannot decode Activity Input"))
      .chain(
        activityInput => userCgnModel.findAll(activityInput.fiscalCode)
        .mapLeft( _ => fail(_, "Cannot retriew all cgn card") )
      )
      .chain( 
        cards => 
          array.sequence(taskEither)(cards.map( element => userCgnModel.deleteVersion(element.fiscalCode, element.id) ))
          .mapLeft( _ => fail(_, "Cannot delete cgn version")  )
          .map( () => cards )
      )
      .fold<DeleteCgnActivityResult>(identity, cards => ({ kind: "SUCCESS", cards }))
      .run();
     
};


