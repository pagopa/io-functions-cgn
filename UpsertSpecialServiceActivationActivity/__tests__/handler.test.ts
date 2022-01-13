/* eslint-disable @typescript-eslint/no-explicit-any */
import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";
import { context } from "../../__mocks__/durable-functions";
import { aFiscalCode } from "../../__mocks__/mock";
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
  it("should throw if an error occurs during input decode retrieve", async () => {
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
      TE.mapLeft(ex => expect(ex).toBeDefined())
    )();
  });

  it("should return a transient failure if an error occurs during special service activation's upsert call", async () => {
    upsertServiceActivationMock.mockImplementationOnce(() =>
      Promise.reject("Connectivity Error")
    );
    const upsertSpecialServiceActivationActivity = getUpsertSpecialServiceActivationActivityHandler(
      servicesClientMock
    );
    const response = await upsertSpecialServiceActivationActivity(
      context,
      anActivityInput
    );
    expect(response.kind).toBe("TRANSIENT");
    if (response.kind === "TRANSIENT") {
      expect(response.reason).toBe(
        "TRANSIENT FAILURE|ERROR=Connectivity Error"
      );
    }
  });

  it.each`
    error                      | expectedResponse
    ${"Too many requests"}     | ${{ status: 429 }}
    ${"Internal Server error"} | ${{ status: 500 }}
  `(
    "should return a TRANSIENT FAILURE if special service activation's upsert returns $error",
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
          () => fail("Cannot throw")
        ),
        TE.map(response => {
          expect(response.kind).toBe("TRANSIENT");
          if (Failure.is(response)) {
            expect(response.reason).toBe(
              `TRANSIENT FAILURE|ERROR=Cannot upsert service activation with response code ${expectedResponse.status}`
            );
          }
        })
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
    "should throw if special service activation's upsert returns $error PERMANENT error",
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
          _ => {
            const ex = E.toError(_);
            expect(ex).toEqual(
              expect.objectContaining({
                message: `PERMANENT FAILURE|ERROR=Cannot upsert service activation with response code ${expectedResponse.status}`
              })
            );
          }
        ),
        TE.map(() => fail("Cannot return a response"))
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
