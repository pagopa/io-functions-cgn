/* tslint:disable: no-any */
import * as date_fns from "date-fns";
import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import { context } from "../../__mocks__/durable-functions";
import { now } from "../../__mocks__/mock";
import * as models from "../../utils/models";
import {
  ActivityInput,
  getEnqueueEycaActivationActivityHandler
} from "../handler";

const enqueueEycaActivationMock = jest.fn().mockReturnValue(taskEither.of({}));

const aFiscalCode = "RODFDS82S10H501T" as FiscalCode;
const upsertMock = jest.fn().mockImplementation(() => taskEither.of({}));
const userCgnModelMock = {
  upsert: upsertMock
};

const anActivityInput: ActivityInput = {
  fiscalCode: aFiscalCode
};

describe("EnqueueEycaActivationActivity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return failure if an error occurs during message enqueue", async () => {
    const enqueueEycaActivationActivityHandler = getEnqueueEycaActivationActivityHandler(
      userCgnModelMock as any,
      enqueueEycaActivationMock as any
    );

    enqueueEycaActivationMock.mockReturnValueOnce(
      fromLeft(new Error("Error while enqueuing message"))
    );
    const response = await enqueueEycaActivationActivityHandler(
      context,
      anActivityInput
    );
    expect(response.kind).toBe("FAILURE");
  });
  it("should return failure if an error occurs during Eyca card insert", async () => {
    const enqueueEycaActivationActivityHandler = getEnqueueEycaActivationActivityHandler(
      userCgnModelMock as any,
      enqueueEycaActivationMock as any
    );

    upsertMock.mockImplementationOnce(() =>
      fromLeft(new Error("Error upserting"))
    );
    const response = await enqueueEycaActivationActivityHandler(
      context,
      anActivityInput
    );
    expect(response.kind).toBe("FAILURE");
  });

  it("should return success if Eyca activation was enqueued successfully", async () => {
    const enqueueEycaActivationActivityHandler = getEnqueueEycaActivationActivityHandler(
      userCgnModelMock as any,
      enqueueEycaActivationMock as any
    );
    const response = await enqueueEycaActivationActivityHandler(
      context,
      anActivityInput
    );
    expect(response.kind).toBe("SUCCESS");
    expect(enqueueEycaActivationMock).toBeCalledWith({
      fiscalCode: anActivityInput.fiscalCode
    });
  });
});
