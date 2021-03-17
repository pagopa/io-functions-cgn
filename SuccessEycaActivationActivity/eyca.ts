import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { format } from "date-fns";
import { toError } from "fp-ts/lib/Either";
import {
  fromEither,
  fromLeft,
  taskEither,
  tryCatch
} from "fp-ts/lib/TaskEither";
import { RedisClient } from "redis";
import { EycaAPIClient } from "../clients/eyca";
import { Timestamp } from "../generated/definitions/Timestamp";
import { CcdbNumber } from "../generated/eyca-api/CcdbNumber";
import { ErrorResponse } from "../generated/eyca-api/ErrorResponse";
import { errorsToError } from "../utils/conversions";
import { getTask, setWithExpirationTask } from "../utils/redis_storage";

export const CCDB_SESSION_ID_KEY = "CCDB_SESSION_ID";
export const CCDB_SESSION_ID_TTL = 1500;

const ccdbLogin = (
  eycaClient: ReturnType<EycaAPIClient>,
  username: NonEmptyString,
  password: NonEmptyString
) =>
  tryCatch(
    () =>
      eycaClient.authLogin({
        password,
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

const retrieveCcdbSessionId = (
  redisClient: RedisClient,
  eycaClient: ReturnType<EycaAPIClient>,
  username: NonEmptyString,
  password: NonEmptyString
) =>
  getTask(redisClient, CCDB_SESSION_ID_KEY).foldTaskEither(
    () => ccdbLogin(eycaClient, username, password),
    maybeSessionId =>
      maybeSessionId.foldL(
        () =>
          ccdbLogin(eycaClient, username, password).chain(_ =>
            setWithExpirationTask(
              redisClient,
              CCDB_SESSION_ID_KEY,
              _,
              CCDB_SESSION_ID_TTL
            ).foldTaskEither(
              () => taskEither.of(_),
              () => taskEither.of(_)
            )
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
