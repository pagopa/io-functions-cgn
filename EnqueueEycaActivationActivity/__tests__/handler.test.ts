/* eslint-disable @typescript-eslint/no-explicit-any */
import * as TE from "fp-ts/lib/TaskEither";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { context } from "../../__mocks__/durable-functions";
import { StatusEnum } from "../../generated/definitions/CardPending";
import {
  ActivityInput,
  getEnqueueEycaActivationActivityHandler
} from "../handler";
import { pipe } from "fp-ts/lib/function";
import { toError } from "fp-ts/lib/Either";
import { testFail } from "../../__mocks__/mock";

const enqueueEycaActivationMock = jest.fn();

const aFiscalCode = "RODFDS82S10H501T" as FiscalCode;
const upsertMock = jest.fn().mockImplementation(() => TE.of({}));
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

  it("should throw if an error occurs during message enqueue", async () => {
    enqueueEycaActivationMock.mockImplementationOnce(() =>
      TE.left(new Error("Error while enqueuing message"))
    );

    const enqueueEycaActivationActivityHandler = getEnqueueEycaActivationActivityHandler(
      userCgnModelMock as any,
      enqueueEycaActivationMock as any
    );

    await pipe(
      TE.tryCatch(
        () => enqueueEycaActivationActivityHandler(context, anActivityInput),
        toError
      ),
      TE.bimap(e => {
        expect(e).toEqual(
          expect.objectContaining({
            message:
              "TRANSIENT FAILURE|ERROR=Cannot enqueue EYCA activation DETAIL=Error while enqueuing message"
          })
        );
      }, testFail)
    )();
  });
  it("should throw if an error occurs during Eyca card insert", async () => {
    const enqueueEycaActivationActivityHandler = getEnqueueEycaActivationActivityHandler(
      userCgnModelMock as any,
      enqueueEycaActivationMock as any
    );

    upsertMock.mockImplementationOnce(() =>
      TE.left(new Error("Error upserting"))
    );
    await pipe(
      TE.tryCatch(
        () => enqueueEycaActivationActivityHandler(context, anActivityInput),
        toError
      ),
      TE.bimap(e => {
        expect(e).toEqual(
          expect.objectContaining({
            message:
              "TRANSIENT FAILURE|ERROR=Cannot insert EYCA Pending status DETAIL=Error upserting"
          })
        );
      }, testFail)
    )();
  });

  it("should return a permanent failure if activity input decode fails", async () => {
    const enqueueEycaActivationActivityHandler = getEnqueueEycaActivationActivityHandler(
      userCgnModelMock as any,
      enqueueEycaActivationMock as any
    );

    await pipe(
      TE.tryCatch(
        () => enqueueEycaActivationActivityHandler(context, {}),
        toError
      ),
      TE.bimap(testFail, response => {
        expect(response.kind).toEqual("FAILURE");
      })
    )();
  });

  it("should return success if Eyca activation was enqueued successfully", async () => {
    enqueueEycaActivationMock.mockImplementationOnce(() => TE.of({}));
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
    expect(upsertMock).toBeCalledWith({
      card: { status: StatusEnum.PENDING },
      fiscalCode: anActivityInput.fiscalCode,
      kind: "INewUserEycaCard"
    });
  });
});
