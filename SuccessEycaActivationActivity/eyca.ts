import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { format } from "date-fns";
import * as E from "fp-ts/lib/Either";
import { flow, pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { RedisClient } from "redis";
import { EycaAPIClient } from "../clients/eyca";
import { Timestamp } from "../generated/definitions/Timestamp";
import { CcdbNumber } from "../generated/eyca-api/CcdbNumber";
import { ErrorResponse } from "../generated/eyca-api/ErrorResponse";
import { errorsToError } from "../utils/conversions";
import { getTask, setWithExpirationTask } from "../utils/redis_storage";

export const CCDB_SESSION_ID_KEY = "CCDB_SESSION_ID";
export const CCDB_SESSION_ID_TTL = 1700;

/**
 * Performs a login through EYCA CCDB Login API
 * via username and password credentials.
 * A success response includes a session_id token
 */
const ccdbLogin = (
  eycaClient: ReturnType<EycaAPIClient>,
  username: NonEmptyString,
  password: NonEmptyString
): TE.TaskEither<Error, NonEmptyString> =>
  pipe(
    TE.tryCatch(
      () =>
        eycaClient.authLogin({
          password,
          type: "json",
          username
        }),
      E.toError
    ),
    TE.mapLeft(
      err => new Error(`Cannot call EYCA authLogin API ${err.message}`)
    ),
    TE.chain(flow(TE.fromEither, TE.mapLeft(errorsToError))),
    TE.chain(res =>
      res.status !== 200 || ErrorResponse.is(res.value.api_response)
        ? TE.left(
            new Error(
              `Error on EYCA authLogin API|STATUS=${res.status}, DETAIL=${res.value.api_response.text}`
            )
          )
        : TE.of(res.value.api_response.text)
    )
  );

/**
 * Retrieves a previous stored session_id on Redis cache.
 * If missing a new login is performed and the related session_id
 * is stored on Redis.
 */
const retrieveCcdbSessionId = (
  redisClient: RedisClient,
  eycaClient: ReturnType<EycaAPIClient>,
  username: NonEmptyString,
  password: NonEmptyString
): TE.TaskEither<Error, NonEmptyString> =>
  pipe(
    getTask(redisClient, CCDB_SESSION_ID_KEY),
    TE.chain(
      O.fold(
        () =>
          pipe(
            ccdbLogin(eycaClient, username, password),
            TE.chain(sessionId =>
              pipe(
                setWithExpirationTask(
                  redisClient,
                  CCDB_SESSION_ID_KEY,
                  sessionId,
                  CCDB_SESSION_ID_TTL
                ),
                TE.map(() => sessionId)
              )
            )
          ),
        sessionId => TE.of(sessionId as NonEmptyString)
      )
    )
  );

export const updateCard = (
  redisClient: RedisClient,
  eycaClient: ReturnType<EycaAPIClient>,
  username: NonEmptyString,
  password: NonEmptyString,
  ccdbNumber: CcdbNumber,
  cardDateExpiration: Timestamp
) =>
  pipe(
    retrieveCcdbSessionId(redisClient, eycaClient, username, password),
    TE.chain(sessionId =>
      pipe(
        TE.tryCatch(
          () =>
            eycaClient.updateCard({
              card_date_expiration: format(cardDateExpiration, "yyyy-MM-dd"),
              ccdb_number: ccdbNumber,
              session_id: sessionId,
              type: "json"
            }),
          E.toError
        ),
        TE.mapLeft(
          err => new Error(`Cannot call EYCA updateCard API ${err.message}`)
        ),
        TE.chain(flow(TE.fromEither, TE.mapLeft(errorsToError))),
        TE.chain(res =>
          res.status !== 200 || ErrorResponse.is(res.value.api_response)
            ? TE.left(
                new Error(
                  `Error on EYCA updateCard API|STATUS=${res.status}, DETAIL=${res.value.api_response.text}`
                )
              )
            : TE.of(res.value.api_response.text)
        )
      )
    )
  );

export const preIssueCard = (
  redisClient: RedisClient,
  eycaClient: ReturnType<EycaAPIClient>,
  username: NonEmptyString,
  password: NonEmptyString
) =>
  pipe(
    retrieveCcdbSessionId(redisClient, eycaClient, username, password),
    TE.chain(sessionId =>
      pipe(
        TE.tryCatch(
          () =>
            eycaClient.preIssueCard({
              session_id: sessionId,
              type: "json"
            }),
          E.toError
        ),
        TE.chain(flow(TE.fromEither, TE.mapLeft(errorsToError))),
        TE.chain(response =>
          response.status !== 200 ||
          ErrorResponse.is(response.value.api_response)
            ? TE.left(
                new Error(
                  `Error on EYCA preIssueCard API|STATUS=${response.status}, DETAIL=${response.value.api_response.text}`
                )
              )
            : TE.of(response.value.api_response.data.card[0].ccdb_number)
        ),
        TE.chain(responseText =>
          pipe(
            responseText,
            CcdbNumber.decode,
            TE.fromEither,
            TE.mapLeft(errorsToError)
          )
        )
      )
    )
  );
