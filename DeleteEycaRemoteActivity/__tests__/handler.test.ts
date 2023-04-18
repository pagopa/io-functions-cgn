/* tslint:disable: no-any */
import * as TE from "fp-ts/lib/TaskEither";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { context } from "../../__mocks__/durable-functions";
import { CcdbNumber } from "../../generated/eyca-api/CcdbNumber";
import * as eycaUtils from "../../utils/eyca";
import { ActivityInput, getDeleteEycaRemoteActivityHandler } from "../handler";
import { pipe } from "fp-ts/lib/function";
import { toError } from "fp-ts/lib/Either";
import { testFail } from "../../__mocks__/mock";
import { RedisClientFactory } from "../../utils/redis";

const anActivityInput: ActivityInput = {
  cardNumber: "A234-B333-C222-D444" as CcdbNumber
};

const aWrongActivityInput = {
  cardNumber: "1234-3333-2222"
};

const deleteCardMock = jest.fn().mockImplementation(() => TE.of("OK"));
jest.spyOn(eycaUtils, "deleteCard").mockImplementation(deleteCardMock);

const anEycaUsername = "EYCA_USERNAME" as NonEmptyString;
const anEycaPassword = "EYCA_PASSWORD" as NonEmptyString;

const redisClientFactoryMock = {
  getInstance: jest.fn()
} as unknown as RedisClientFactory;

describe("DeleteEycaRemoteActivity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should return failure caused by wrong input", async () => {
    const deleteEycaRemoteActivityHandler = getDeleteEycaRemoteActivityHandler(
      redisClientFactoryMock,
      {} as any,
      anEycaUsername,
      anEycaPassword
    );
    const response = await deleteEycaRemoteActivityHandler(
      context,
      aWrongActivityInput
    );
    expect(response.kind).toBe("FAILURE");
  });

  it("should throw if a transient failure occurs during deleteCard", async () => {
    deleteCardMock.mockImplementationOnce(() =>
      TE.left({ kind: "TRANSIENT", reason: "Cannot delete card" })
    );
    const deleteEycaRemoteActivityHandler = getDeleteEycaRemoteActivityHandler(
      redisClientFactoryMock,
      {} as any,
      anEycaUsername,
      anEycaPassword
    );
    await pipe(
      TE.tryCatch(
        () => deleteEycaRemoteActivityHandler(context, anActivityInput),
        toError
      ),
      TE.bimap(e => {
        expect(e).toBeDefined();
        expect(e.message).toEqual("Cannot delete card");
      }, testFail)
    )();
  });

  it("should return a failure if permanent failure occurs during deleteCard", async () => {
    deleteCardMock.mockImplementationOnce(() =>
      TE.left({ kind: "PERMANENT", reason: "Cannot delete card" })
    );
    const deleteEycaRemoteActivityHandler = getDeleteEycaRemoteActivityHandler(
      redisClientFactoryMock,
      {} as any,
      anEycaUsername,
      anEycaPassword
    );
    await pipe(
      TE.tryCatch(
        () => deleteEycaRemoteActivityHandler(context, anActivityInput),
        toError
      ),
      TE.bimap(testFail, response => {
        expect(response).toEqual({
          kind: "FAILURE",
          reason: "Cannot delete card"
        });
      })
    )();
  });

  it("should return success if a delete of Eyca Card succeded", async () => {
    const deleteEycaRemoteActivityHandler = getDeleteEycaRemoteActivityHandler(
      redisClientFactoryMock,
      {} as any,
      anEycaUsername,
      anEycaPassword
    );
    const response = await deleteEycaRemoteActivityHandler(
      context,
      anActivityInput
    );
    expect(response.kind).toBe("SUCCESS");
  });
});
