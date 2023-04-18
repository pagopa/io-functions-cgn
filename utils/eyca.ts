/* eslint-disable max-params */
import { IResponseType } from "@pagopa/ts-commons/lib/requests";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { format } from "date-fns";
import * as E from "fp-ts/lib/Either";
import { flow, pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { RedisClientFactory } from "../utils/redis";
import { EycaAPIClient } from "../clients/eyca";
import { Timestamp } from "../generated/definitions/Timestamp";
import { CcdbNumber } from "../generated/eyca-api/CcdbNumber";
import { ErrorResponse } from "../generated/eyca-api/ErrorResponse";
import { errorsToError } from "../utils/conversions";
import {
  Failure,
  toPermanentFailure,
  toTransientFailure
} from "../utils/errors";
import { getTask, setWithExpirationTask } from "../utils/redis_storage";

export const CCDB_SESSION_ID_KEY = "CCDB_SESSION_ID";
export const CCDB_SESSION_ID_TTL = 1700;

const mapResponseToFailure = <T extends { readonly api_response: unknown }>(
  res: IResponseType<number, T, never>,
  error: Error,
  detail?: string
): Failure =>
  res.status >= 500 ||
  (res.status === 200 && ErrorResponse.is(res.value.api_response))
    ? toTransientFailure(error, detail)
    : toPermanentFailure(error, detail);

/**
 * Performs a login through EYCA CCDB Login API
 * via username and password credentials.
 * A success response includes a session_id token
 */
const ccdbLogin = (
  eycaClient: ReturnType<EycaAPIClient>,
  username: NonEmptyString,
  password: NonEmptyString
): TE.TaskEither<Failure, NonEmptyString> =>
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
    TE.mapLeft(err =>
      toTransientFailure(
        new Error(`Cannot call EYCA authLogin API ${err.message}`)
      )
    ),
    TE.chain(
      flow(
        TE.fromEither,
        TE.mapLeft(
          flow(errorsToError, err =>
            toTransientFailure(err, "Cannot decode EYCA authLogin response")
          )
        )
      )
    ),
    TE.chain(res =>
      res.status !== 200 || ErrorResponse.is(res.value.api_response)
        ? TE.left(
            mapResponseToFailure(
              res,
              new Error(`Error on EYCA authLogin API|STATUS=${res.status}`),
              res.value.api_response.text
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
  redisClientFactory: RedisClientFactory,
  eycaClient: ReturnType<EycaAPIClient>,
  username: NonEmptyString,
  password: NonEmptyString
): TE.TaskEither<Failure, NonEmptyString> =>
  pipe(
    getTask(redisClientFactory, CCDB_SESSION_ID_KEY),
    TE.mapLeft(toTransientFailure),
    TE.chain(
      O.fold(
        () =>
          pipe(
            ccdbLogin(eycaClient, username, password),
            TE.chain(sessionId =>
              pipe(
                setWithExpirationTask(
                  redisClientFactory,
                  CCDB_SESSION_ID_KEY,
                  sessionId,
                  CCDB_SESSION_ID_TTL
                ),
                TE.bimap(toTransientFailure, () => sessionId)
              )
            )
          ),
        sessionId => TE.of(sessionId as NonEmptyString)
      )
    )
  );

export const updateCard = (
  redisClientFactory: RedisClientFactory,
  eycaClient: ReturnType<EycaAPIClient>,
  username: NonEmptyString,
  password: NonEmptyString,
  ccdbNumber: CcdbNumber,
  cardDateExpiration: Timestamp
): TE.TaskEither<Failure, NonEmptyString> =>
  pipe(
    retrieveCcdbSessionId(redisClientFactory, eycaClient, username, password),
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
        TE.mapLeft(err =>
          toTransientFailure(
            err,
            `Cannot call EYCA updateCard API ${err.message}`
          )
        ),
        TE.chain(
          flow(
            TE.fromEither,
            TE.mapLeft(
              flow(errorsToError, err =>
                toTransientFailure(
                  err,
                  "Cannot decode EYCA updateCard response"
                )
              )
            )
          )
        ),
        TE.chain(res =>
          res.status !== 200 || ErrorResponse.is(res.value.api_response)
            ? TE.left(
                mapResponseToFailure(
                  res,
                  new Error(
                    `Error on EYCA updateCard API|STATUS=${res.status}`
                  ),
                  res.value.api_response.text
                )
              )
            : TE.of(res.value.api_response.text)
        )
      )
    )
  );

export const preIssueCard = (
  redisClientFactory: RedisClientFactory,
  eycaClient: ReturnType<EycaAPIClient>,
  username: NonEmptyString,
  password: NonEmptyString
): TE.TaskEither<Failure, CcdbNumber> =>
  pipe(
    retrieveCcdbSessionId(redisClientFactory, eycaClient, username, password),
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
        TE.mapLeft(err =>
          toTransientFailure(
            new Error(`Cannot call EYCA preIssueCard API ${err.message}`)
          )
        ),
        TE.chain(
          flow(
            TE.fromEither,
            TE.mapLeft(
              flow(errorsToError, err =>
                toTransientFailure(
                  err,
                  "Cannot decode EYCA preIssueCard response"
                )
              )
            )
          )
        ),
        TE.chain(response =>
          response.status !== 200 ||
          ErrorResponse.is(response.value.api_response)
            ? TE.left(
                mapResponseToFailure(
                  response,
                  new Error(
                    `Error on EYCA preIssueCard API|STATUS=${response.status}`
                  ),
                  response.value.api_response.text
                )
              )
            : TE.of(response.value.api_response.data.card[0].ccdb_number)
        ),
        TE.chain(
          flow(
            CcdbNumber.decode,
            TE.fromEither,
            TE.mapLeft(flow(errorsToError, toPermanentFailure))
          )
        )
      )
    )
  );

export const deleteCard = (
  redisClientFactory: RedisClientFactory,
  eycaClient: ReturnType<EycaAPIClient>,
  username: NonEmptyString,
  password: NonEmptyString,
  ccdbNumber: CcdbNumber
): TE.TaskEither<Failure, NonEmptyString> =>
  pipe(
    retrieveCcdbSessionId(redisClientFactory, eycaClient, username, password),
    TE.chain(sessionId =>
      pipe(
        TE.tryCatch(
          () =>
            eycaClient.deleteCard({
              ccdb_number: ccdbNumber,
              session_id: sessionId,
              type: "json"
            }),
          E.toError
        ),
        TE.mapLeft(err =>
          toTransientFailure(err, "Cannot call EYCA deleteCard API")
        ),
        TE.chain(
          flow(
            TE.fromEither,
            TE.mapLeft(
              flow(errorsToError, err =>
                toTransientFailure(
                  err,
                  "Cannot decode EYCA deleteCard response"
                )
              )
            )
          )
        ),
        TE.chainW(res =>
          res.status !== 200 || ErrorResponse.is(res.value.api_response)
            ? TE.left(
                mapResponseToFailure(
                  res,
                  new Error(
                    `Error on EYCA deleteCard API|STATUS=${res.status}`
                  ),
                  res.value.api_response.text
                )
              )
            : TE.of(res.value.api_response.text)
        )
      )
    )
  );
