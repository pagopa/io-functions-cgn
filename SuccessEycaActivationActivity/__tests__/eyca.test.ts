/* tslint:disable: no-any */
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { right } from "fp-ts/lib/Either";
import { none, some } from "fp-ts/lib/Option";
import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import { CcdbNumber } from "../../generated/eyca-api/CcdbNumber";
import * as redis from "../../utils/redis_storage";
import { preIssueCard, updateCard } from "../eyca";

const anEycaApiUsername = "USERNAME" as NonEmptyString;
const anEycaApiPassword = "PASSWORD" as NonEmptyString;
const anEycaSessionId = "aSessionId";
const aCcdbNumber = "X123-Y123-Z123-W123" as CcdbNumber;
const preIssueCardMock = jest.fn().mockImplementation(() =>
  Promise.resolve(
    right({
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
    right({
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
    right({
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
  preIssueCard: preIssueCardMock,
  updateCard: updateCardMock
};

const getTaskMock = jest
  .fn()
  .mockImplementation(() => taskEither.of(some(anEycaSessionId)));
jest.spyOn(redis, "getTask").mockImplementation(getTaskMock);

const setWithExpirationTaskMock = jest
  .fn()
  .mockImplementation(() => taskEither.of(true));
jest
  .spyOn(redis, "setWithExpirationTask")
  .mockImplementation(setWithExpirationTaskMock);

const anErrorEycaAPIResponse = Promise.resolve(
  right({
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
    await preIssueCard(
      {} as any,
      eycaApiClient,
      anEycaApiUsername,
      anEycaApiPassword
    )
      .fold(
        err => expect(err).toBeDefined(),
        () => fail()
      )
      .run();
  });
  it("should fail if EYCA preIssue API Call returns 500", async () => {
    preIssueCardMock.mockImplementationOnce(() => anErrorEycaAPIResponse);
    await preIssueCard(
      {} as any,
      eycaApiClient,
      anEycaApiUsername,
      anEycaApiPassword
    )
      .fold(
        err => expect(err).toBeDefined(),
        () => fail()
      )
      .run();
  });

  it("should fail if EYCA authLogin fails while session is not present in redis", async () => {
    getTaskMock.mockImplementationOnce(() => taskEither.of(none));
    authLoginMock.mockImplementationOnce(() => anErrorEycaAPIResponse);
    await preIssueCard(
      {} as any,
      eycaApiClient,
      anEycaApiUsername,
      anEycaApiPassword
    )
      .fold(
        err => {
          expect(getTaskMock).toBeCalledTimes(1);
          expect(authLoginMock).toBeCalledTimes(1);
          expect(setWithExpirationTaskMock).not.toHaveBeenCalled();
          expect(err).toBeDefined();
        },
        () => fail()
      )
      .run();
  });

  it("should succeed with a new sessionId provided by EYCA authLogin", async () => {
    getTaskMock.mockImplementationOnce(() => taskEither.of(none));
    await preIssueCard(
      {} as any,
      eycaApiClient,
      anEycaApiUsername,
      anEycaApiPassword
    )
      .fold(
        () => fail(),
        ccdbNumber => {
          expect(getTaskMock).toBeCalledTimes(1);
          expect(authLoginMock).toBeCalledTimes(1);
          expect(setWithExpirationTaskMock).toHaveBeenCalledTimes(1);
          expect(ccdbNumber).toEqual(aCcdbNumber);
        }
      )
      .run();
  });

  it("should succeed with a valid sessionId retrieved from Redis", async () => {
    await preIssueCard(
      {} as any,
      eycaApiClient,
      anEycaApiUsername,
      anEycaApiPassword
    )
      .fold(
        () => fail(),
        ccdbNumber => {
          expect(getTaskMock).toBeCalledTimes(1);
          expect(authLoginMock).not.toHaveBeenCalled();
          expect(setWithExpirationTaskMock).not.toHaveBeenCalled();
          expect(ccdbNumber).toEqual(aCcdbNumber);
        }
      )
      .run();
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
    await updateCard(
      {} as any,
      eycaApiClient,
      anEycaApiUsername,
      anEycaApiPassword,
      aCcdbNumber,
      new Date()
    )
      .fold(
        err => expect(err).toBeDefined(),
        () => fail()
      )
      .run();
  });
  it("should fail if EYCA preIssue API Call returns 500", async () => {
    updateCardMock.mockImplementationOnce(() => anErrorEycaAPIResponse);
    await updateCard(
      {} as any,
      eycaApiClient,
      anEycaApiUsername,
      anEycaApiPassword,
      aCcdbNumber,
      new Date()
    )
      .fold(
        err => expect(err).toBeDefined(),
        () => fail()
      )
      .run();
  });

  it("should fail if EYCA authLogin fails while session is not present in redis", async () => {
    getTaskMock.mockImplementationOnce(() => taskEither.of(none));
    authLoginMock.mockImplementationOnce(() => anErrorEycaAPIResponse);
    await updateCard(
      {} as any,
      eycaApiClient,
      anEycaApiUsername,
      anEycaApiPassword,
      aCcdbNumber,
      new Date()
    )
      .fold(
        e => {
          expect(getTaskMock).toBeCalledTimes(1);
          expect(authLoginMock).toBeCalledTimes(1);
          expect(setWithExpirationTaskMock).not.toHaveBeenCalled();
          expect(e).toBeDefined();
        },
        () => fail()
      )
      .run();
  });

  it("should succeed with a new sessionId provided by EYCA authLogin", async () => {
    getTaskMock.mockImplementationOnce(() => taskEither.of(none));
    await updateCard(
      {} as any,
      eycaApiClient,
      anEycaApiUsername,
      anEycaApiPassword,
      aCcdbNumber,
      new Date()
    )
      .fold(
        () => fail(),
        _ => {
          expect(getTaskMock).toBeCalledTimes(1);
          expect(authLoginMock).toBeCalledTimes(1);
          expect(setWithExpirationTaskMock).toHaveBeenCalledTimes(1);
        }
      )
      .run();
  });

  it("should fail if Redis is unreachable", async () => {
    getTaskMock.mockImplementationOnce(() => fromLeft(new Error("Timeout")));
    await updateCard(
      {} as any,
      eycaApiClient,
      anEycaApiUsername,
      anEycaApiPassword,
      aCcdbNumber,
      new Date()
    )
      .fold(
        () => {
          expect(getTaskMock).toBeCalledTimes(1);
          expect(authLoginMock).not.toHaveBeenCalled();
          expect(setWithExpirationTaskMock).not.toHaveBeenCalled();
        },
        () => fail()
      )
      .run();
  });

  it("should succeed with a valid sessionId retrieved from Redis", async () => {
    await updateCard(
      {} as any,
      eycaApiClient,
      anEycaApiUsername,
      anEycaApiPassword,
      aCcdbNumber,
      new Date()
    )
      .fold(
        () => fail(),
        _ => {
          expect(getTaskMock).toBeCalledTimes(1);
          expect(authLoginMock).not.toHaveBeenCalled();
          expect(setWithExpirationTaskMock).not.toHaveBeenCalled();
          expect(_).toEqual("Object(s) updated.");
        }
      )
      .run();
  });
});
