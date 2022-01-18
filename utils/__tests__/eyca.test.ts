/* eslint-disable @typescript-eslint/no-explicit-any */
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { CcdbNumber } from "../../generated/eyca-api/CcdbNumber";
import { preIssueCard, updateCard } from "../eyca";
import * as redis from "../redis_storage";

const anEycaApiUsername = "USERNAME" as NonEmptyString;
const anEycaApiPassword = "PASSWORD" as NonEmptyString;
const anEycaSessionId = "aSessionId";
const aCcdbNumber = "X123-Y123-Z123-W123" as CcdbNumber;
const preIssueCardMock = jest.fn().mockImplementation(() =>
  Promise.resolve(
    E.right({
      status: 200,
      value: {
        api_response: {
          data: {
            card: [{ ccdb_number: aCcdbNumber }]
          }
        }
      }
    })
  )
);
const updateCardMock = jest.fn().mockImplementation(() =>
  Promise.resolve(
    E.right({
      status: 200,
      value: {
        api_response: {
          text: "Object(s) updated."
        }
      }
    })
  )
);
const authLoginMock = jest.fn().mockImplementation(() =>
  Promise.resolve(
    E.right({
      status: 200,
      value: {
        api_response: {
          text: anEycaSessionId
        }
      }
    })
  )
);
const eycaApiClient = {
  authLogin: authLoginMock,
  deleteCard: jest.fn(),
  preIssueCard: preIssueCardMock,
  updateCard: updateCardMock
} as any;

const getTaskMock = jest
  .fn()
  .mockImplementation(() => TE.of(O.some(anEycaSessionId)));
jest.spyOn(redis, "getTask").mockImplementation(getTaskMock);

const setWithExpirationTaskMock = jest
  .fn()
  .mockImplementation(() => TE.of(true));
jest
  .spyOn(redis, "setWithExpirationTask")
  .mockImplementation(setWithExpirationTaskMock);

const anErrorEycaAPIResponse = Promise.resolve(
  E.right({
    status: 500,
    value: {
      api_response: {
        error: 1
      }
    }
  })
);

describe("preIssueCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should fail if EYCA preIssue API Call fails", async () => {
    preIssueCardMock.mockImplementationOnce(() =>
      Promise.reject(new Error("Cannot call CCDB API"))
    );
    await pipe(
      preIssueCard(
        {} as any,
        eycaApiClient,
        anEycaApiUsername,
        anEycaApiPassword
      ),
      TE.bimap(
        err => expect(err).toBeDefined(),
        () => fail()
      ),
      TE.toUnion
    )();
  });
  it("should fail if EYCA preIssue API Call returns 500", async () => {
    preIssueCardMock.mockImplementationOnce(() => anErrorEycaAPIResponse);
    await pipe(
      preIssueCard(
        {} as any,
        eycaApiClient,
        anEycaApiUsername,
        anEycaApiPassword
      ),
      TE.bimap(
        err => expect(err).toBeDefined(),
        () => fail()
      ),
      TE.toUnion
    )();
  });

  it("should fail if EYCA authLogin fails while session is not present in redis", async () => {
    getTaskMock.mockImplementationOnce(() => TE.of(O.none));
    authLoginMock.mockImplementationOnce(() => anErrorEycaAPIResponse);
    await pipe(
      preIssueCard(
        {} as any,
        eycaApiClient,
        anEycaApiUsername,
        anEycaApiPassword
      ),
      TE.bimap(
        err => {
          expect(getTaskMock).toBeCalledTimes(1);
          expect(authLoginMock).toBeCalledTimes(1);
          expect(setWithExpirationTaskMock).not.toHaveBeenCalled();
          expect(err).toBeDefined();
        },
        () => fail()
      )
    )();
  });

  it("should succeed with a new sessionId provided by EYCA authLogin", async () => {
    getTaskMock.mockImplementationOnce(() => TE.of(O.none));
    await pipe(
      preIssueCard(
        {} as any,
        eycaApiClient,
        anEycaApiUsername,
        anEycaApiPassword
      ),
      TE.bimap(
        () => fail(),
        ccdbNumber => {
          expect(getTaskMock).toBeCalledTimes(1);
          expect(authLoginMock).toBeCalledTimes(1);
          expect(setWithExpirationTaskMock).toHaveBeenCalledTimes(1);
          expect(ccdbNumber).toEqual(aCcdbNumber);
        }
      )
    )();
  });

  it("should succeed with a valid sessionId retrieved from Redis", async () => {
    await pipe(
      preIssueCard(
        {} as any,
        eycaApiClient,
        anEycaApiUsername,
        anEycaApiPassword
      ),
      TE.bimap(
        () => fail(),
        ccdbNumber => {
          expect(getTaskMock).toBeCalledTimes(1);
          expect(authLoginMock).not.toHaveBeenCalled();
          expect(setWithExpirationTaskMock).not.toHaveBeenCalled();
          expect(ccdbNumber).toEqual(aCcdbNumber);
        }
      )
    )();
  });
});

describe("updateCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should fail if EYCA update API Call fails", async () => {
    updateCardMock.mockImplementationOnce(() =>
      Promise.reject(new Error("Cannot call CCDB API"))
    );
    await pipe(
      updateCard(
        {} as any,
        eycaApiClient,
        anEycaApiUsername,
        anEycaApiPassword,
        aCcdbNumber,
        new Date()
      ),
      TE.bimap(
        err => expect(err).toBeDefined(),
        () => fail()
      )
    )();
  });
  it("should fail if EYCA preIssue API Call returns 500", async () => {
    updateCardMock.mockImplementationOnce(() => anErrorEycaAPIResponse);
    await pipe(
      updateCard(
        {} as any,
        eycaApiClient,
        anEycaApiUsername,
        anEycaApiPassword,
        aCcdbNumber,
        new Date()
      ),
      TE.bimap(
        err => expect(err).toBeDefined(),
        () => fail()
      )
    )();
  });

  it("should fail if EYCA authLogin fails while session is not present in redis", async () => {
    getTaskMock.mockImplementationOnce(() => TE.of(O.none));
    authLoginMock.mockImplementationOnce(() => anErrorEycaAPIResponse);
    await pipe(
      updateCard(
        {} as any,
        eycaApiClient,
        anEycaApiUsername,
        anEycaApiPassword,
        aCcdbNumber,
        new Date()
      ),
      TE.bimap(
        e => {
          expect(getTaskMock).toBeCalledTimes(1);
          expect(authLoginMock).toBeCalledTimes(1);
          expect(setWithExpirationTaskMock).not.toHaveBeenCalled();
          expect(e).toBeDefined();
        },
        () => fail()
      )
    )();
  });

  it("should succeed with a new sessionId provided by EYCA authLogin", async () => {
    getTaskMock.mockImplementationOnce(() => TE.of(O.none));
    await pipe(
      updateCard(
        {} as any,
        eycaApiClient,
        anEycaApiUsername,
        anEycaApiPassword,
        aCcdbNumber,
        new Date()
      ),
      TE.bimap(
        () => fail(),
        _ => {
          expect(getTaskMock).toBeCalledTimes(1);
          expect(authLoginMock).toBeCalledTimes(1);
          expect(setWithExpirationTaskMock).toHaveBeenCalledTimes(1);
        }
      )
    )();
  });

  it("should fail if Redis is unreachable", async () => {
    getTaskMock.mockImplementationOnce(() => TE.left(new Error("Timeout")));
    await pipe(
      updateCard(
        {} as any,
        eycaApiClient,
        anEycaApiUsername,
        anEycaApiPassword,
        aCcdbNumber,
        new Date()
      ),
      TE.bimap(
        () => {
          expect(getTaskMock).toBeCalledTimes(1);
          expect(authLoginMock).not.toHaveBeenCalled();
          expect(setWithExpirationTaskMock).not.toHaveBeenCalled();
        },
        () => fail()
      )
    )();
  });

  it("should succeed with a valid sessionId retrieved from Redis", async () => {
    await pipe(
      updateCard(
        {} as any,
        eycaApiClient,
        anEycaApiUsername,
        anEycaApiPassword,
        aCcdbNumber,
        new Date()
      ),
      TE.bimap(
        () => fail(),
        _ => {
          expect(getTaskMock).toBeCalledTimes(1);
          expect(authLoginMock).not.toHaveBeenCalled();
          expect(setWithExpirationTaskMock).not.toHaveBeenCalled();
          expect(_).toEqual("Object(s) updated.");
        }
      )
    )();
  });
});
