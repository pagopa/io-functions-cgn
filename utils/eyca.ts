import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { format } from "date-fns";
import { toError } from "fp-ts/lib/Either";
import {
  fromEither,
  fromLeft,
  TaskEither,
  taskEither,
  tryCatch
} from "fp-ts/lib/TaskEither";
import { RedisClient } from "redis";
import { EycaAPIClient } from "../clients/eyca";
import { Timestamp } from "../generated/definitions/Timestamp";
import { CcdbNumber } from "../generated/eyca-api/CcdbNumber";
import { ErrorResponse } from "../generated/eyca-api/ErrorResponse";
import { errorsToError } from "./conversions";
import { getTask, setWithExpirationTask } from "./redis_storage";

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
): TaskEither<Error, NonEmptyString> =>
  tryCatch(
    () =>
      eycaClient.authLogin({
        password,
        type: "json",
        username
      }),
    toError
  )
    .mapLeft(err => new Error(`Cannot call EYCA authLogin API ${err.message}`))
    .chain(_ => fromEither(_).mapLeft(errorsToError))
    .chain<NonEmptyString>(res =>
      res.status !== 200 || ErrorResponse.is(res.value.api_response)
        ? fromLeft(
            new Error(
              `Error on EYCA authLogin API|STATUS=${res.status}, DETAIL=${res.value.api_response.text}`
            )
          )
        : taskEither.of(res.value.api_response.text)
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
): TaskEither<Error, NonEmptyString> =>
  getTask(redisClient, CCDB_SESSION_ID_KEY).chain(maybeSessionId =>
    maybeSessionId.foldL(
      () =>
        ccdbLogin(eycaClient, username, password).chain(sessionId =>
          setWithExpirationTask(
            redisClient,
            CCDB_SESSION_ID_KEY,
            sessionId,
            CCDB_SESSION_ID_TTL
          ).map(() => sessionId)
        ),
      sessionId => taskEither.of(sessionId as NonEmptyString)
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
  retrieveCcdbSessionId(redisClient, eycaClient, username, password).chain(
    sessionId =>
      tryCatch(
        () =>
          eycaClient.updateCard({
            card_date_expiration: format(cardDateExpiration, "yyyy-MM-dd"),
            ccdb_number: ccdbNumber,
            session_id: sessionId,
            type: "json"
          }),
        toError
      )
        .mapLeft(
          err => new Error(`Cannot call EYCA updateCard API ${err.message}`)
        )
        .chain(_ => fromEither(_).mapLeft(errorsToError))
        .chain<NonEmptyString>(res =>
          res.status !== 200 || ErrorResponse.is(res.value.api_response)
            ? fromLeft(
                new Error(
                  `Error on EYCA updateCard API|STATUS=${res.status}, DETAIL=${res.value.api_response.text}`
                )
              )
            : taskEither.of(res.value.api_response.text)
        )
  );

export const preIssueCard = (
  redisClient: RedisClient,
  eycaClient: ReturnType<EycaAPIClient>,
  username: NonEmptyString,
  password: NonEmptyString
) =>
  retrieveCcdbSessionId(redisClient, eycaClient, username, password).chain(
    sessionId =>
      tryCatch(
        () =>
          eycaClient.preIssueCard({
            session_id: sessionId,
            type: "json"
          }),
        toError
      )
        .chain(_ => fromEither(_).mapLeft(errorsToError))
        .chain(response =>
          response.status !== 200 ||
          ErrorResponse.is(response.value.api_response)
            ? fromLeft(
                new Error(
                  `Error on EYCA preIssueCard API|STATUS=${response.status}, DETAIL=${response.value.api_response.text}`
                )
              )
            : taskEither.of(
                response.value.api_response.data.card[0].ccdb_number
              )
        )
        .chain(responseText =>
          fromEither(CcdbNumber.decode(responseText).mapLeft(errorsToError))
        )
  );

export const deleteCard = (
  redisClient: RedisClient,
  eycaClient: ReturnType<EycaAPIClient>,
  username: NonEmptyString,
  password: NonEmptyString,
  ccdbNumber: CcdbNumber
) =>
  retrieveCcdbSessionId(redisClient, eycaClient, username, password).chain(
    sessionId =>
      tryCatch(
        () =>
          eycaClient.deleteCard({
            ccdb_number: ccdbNumber,
            session_id: sessionId,
            type: "json"
          }),
        toError
      )
        .mapLeft(
          err => new Error(`Cannot call EYCA deleteCard API ${err.message}`)
        )
        .chain(_ => fromEither(_).mapLeft(errorsToError))
        .chain<NonEmptyString>(res =>
          res.status !== 200 || ErrorResponse.is(res.value.api_response)
            ? fromLeft(
                new Error(
                  `Error on EYCA deleteCard API|STATUS=${res.status}, DETAIL=${res.value.api_response.text}`
                )
              )
            : taskEither.of(res.value.api_response.text)
        )
  );
