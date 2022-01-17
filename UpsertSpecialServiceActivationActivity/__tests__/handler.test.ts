/* eslint-disable @typescript-eslint/no-explicit-any */
import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";
import { context } from "../../__mocks__/durable-functions";
import { aFiscalCode, testFail } from "../../__mocks__/mock";
import {
  ActivityInput,
  getUpsertSpecialServiceActivationActivityHandler
} from "../handler";
import { Activation } from "../../generated/services-api/Activation";
import { ServiceId } from "../../generated/services-api/ServiceId";
import { ActivationStatusEnum } from "../../generated/services-api/ActivationStatus";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { Failure } from "../../utils/errors";
import { pipe } from "fp-ts/lib/function";

const aServiceId = "SERVICE_ID" as ServiceId;
const aSpecialServiceActivation: Activation = {
  fiscal_code: aFiscalCode,
  service_id: aServiceId,
  status: ActivationStatusEnum.ACTIVE,
  version: 1 as NonNegativeInteger
};
const upsertServiceActivationMock = jest
  .fn()
  .mockImplementation(() =>
    TE.of({ status: 200, value: aSpecialServiceActivation })()
  );

const servicesClientMock = {
  upsertServiceActivation: upsertServiceActivationMock
} as any;

const aNotFoundResponse = { status: 404, value: "Not found" };

const anActivityInput: ActivityInput = {
  activationStatus: ActivationStatusEnum.ACTIVE,
  fiscalCode: aFiscalCode
};
describe("UpsertSpecialServiceActivationActivity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should return a PERMANENT failure if any error occurs during input decode", async () => {
    const upsertSpecialServiceActivationActivity = getUpsertSpecialServiceActivationActivityHandler(
      servicesClientMock
    );
    await pipe(
      TE.tryCatch(
        () =>
          upsertSpecialServiceActivationActivity(context, {
            aaa: "wrongActivityInput"
          }),
        E.toError
      ),
      TE.bimap(testFail, response => expect(response.kind).toBe("FAILURE"))
    )();
  });

  it("should return a transient failure if an error occurs during special service activation's upsert call", async () => {
    upsertServiceActivationMock.mockImplementationOnce(() =>
      Promise.reject("Connectivity Error")
    );
    const upsertSpecialServiceActivationActivity = getUpsertSpecialServiceActivationActivityHandler(
      servicesClientMock
    );

    await pipe(
      TE.tryCatch(
        () => upsertSpecialServiceActivationActivity(context, anActivityInput),
        E.toError
      ),
      TE.bimap(ex => {
        expect(ex).toEqual(
          expect.objectContaining({
            message: `TRANSIENT FAILURE|ERROR=Connectivity Error`
          })
        );
      }, testFail)
    )();
  });

  it.each`
    error                      | expectedResponse
    ${"Too many requests"}     | ${{ status: 429 }}
    ${"Internal Server error"} | ${{ status: 500 }}
  `(
    "should throw if special service activation's upsert returns $error TRANSIENT error",
    async ({ expectedResponse, failureType }) => {
      upsertServiceActivationMock.mockImplementationOnce(() =>
        TE.of(expectedResponse)()
      );
      const upsertSpecialServiceActivationActivity = getUpsertSpecialServiceActivationActivityHandler(
        servicesClientMock
      );

      await pipe(
        TE.tryCatch(
          () =>
            upsertSpecialServiceActivationActivity(context, anActivityInput),
          E.toError
        ),
        TE.bimap(ex => {
          expect(ex).toEqual(
            expect.objectContaining({
              message: `TRANSIENT FAILURE|ERROR=Cannot upsert service activation with response code ${expectedResponse.status}`
            })
          );
        }, testFail)
      )();
    }
  );

  it.each`
    error                | expectedResponse
    ${"Not Found"}       | ${aNotFoundResponse}
    ${"Unauthorized"}    | ${{ status: 401 }}
    ${"Forbidden"}       | ${{ status: 403 }}
    ${"Unhandled Error"} | ${{ status: 599 }}
  `(
    "return a PERMANENT FAILURE if special service activation's upsert returns $error",
    async ({ expectedResponse }) => {
      upsertServiceActivationMock.mockImplementationOnce(() =>
        TE.of(expectedResponse)()
      );
      const upsertSpecialServiceActivationActivity = getUpsertSpecialServiceActivationActivityHandler(
        servicesClientMock
      );

      await pipe(
        TE.tryCatch(
          () =>
            upsertSpecialServiceActivationActivity(context, anActivityInput),
          testFail
        ),
        TE.map(response => {
          expect(response.kind).toBe("FAILURE");
          if (response.kind === "FAILURE") {
            expect(response.reason).toEqual(
              `PERMANENT FAILURE|ERROR=Cannot upsert service activation with response code ${expectedResponse.status}`
            );
          }
        })
      )();
    }
  );

  it("should return success if special service activation's upsert returns success", async () => {
    const upsertSpecialServiceActivationActivity = getUpsertSpecialServiceActivationActivityHandler(
      servicesClientMock
    );
    const response = await upsertSpecialServiceActivationActivity(
      context,
      anActivityInput
    );
    expect(response.kind).toBe("SUCCESS");
  });
});
