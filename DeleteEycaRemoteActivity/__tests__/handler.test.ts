/* tslint:disable: no-any */
import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { context } from "../../__mocks__/durable-functions";
import { CcdbNumber } from "../../generated/eyca-api/CcdbNumber";
import * as eycaUtils from "../../utils/eyca";
import { ActivityInput, getDeleteEycaRemoteActivityHandler } from "../handler";

const anActivityInput: ActivityInput = {
  cardNumber: "A234-B333-C222-D444" as CcdbNumber
};

const aWrongActivityInput = {
  cardNumber: "1234-3333-2222"
};

const deleteCardMock = jest.fn().mockImplementation(() => taskEither.of("OK"));
jest.spyOn(eycaUtils, "deleteCard").mockImplementation(deleteCardMock);

const anEycaUsername = "EYCA_USERNAME" as NonEmptyString;
const anEycaPassword = "EYCA_PASSWORD" as NonEmptyString;
describe("DeleteEycaRemoteActivity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should return failure caused by wrong input", async () => {
    const deleteEycaRemoteActivityHandler = getDeleteEycaRemoteActivityHandler(
      {} as any,
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

  it("should return failure if an error occurs during deleteCard", async () => {
    deleteCardMock.mockImplementationOnce(() => fromLeft(new Error("Error")));
    const deleteEycaRemoteActivityHandler = getDeleteEycaRemoteActivityHandler(
      {} as any,
      {} as any,
      anEycaUsername,
      anEycaPassword
    );
    const response = await deleteEycaRemoteActivityHandler(
      context,
      anActivityInput
    );
    expect(response.kind).toBe("FAILURE");
    if (response.kind === "FAILURE") {
      expect(response.reason).toBe("Error");
    }
  });

  it("should return success if a delete of Eyca Card succeded", async () => {
    const deleteEycaRemoteActivityHandler = getDeleteEycaRemoteActivityHandler(
      {} as any,
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
