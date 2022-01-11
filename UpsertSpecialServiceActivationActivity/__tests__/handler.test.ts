/* eslint-disable @typescript-eslint/no-explicit-any */
import { toCosmosErrorResponse } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { context } from "../../__mocks__/durable-functions";
import { aFiscalCode, cgnActivatedDates } from "../../__mocks__/mock";
import {
  CardPending,
  StatusEnum
} from "../../generated/definitions/CardPending";
import {
  CardRevoked,
  StatusEnum as RevokedStatusEnum
} from "../../generated/definitions/CardRevoked";
import { UserCgn } from "../../models/user_cgn";
import {
  ActivityInput,
  getUpsertSpecialServiceActivationActivityHandler
} from "../handler";
import { Activation } from "../../generated/services-api/Activation";
import { ServiceId } from "../../generated/services-api/ServiceId";
import { ActivationStatusEnum } from "../../generated/services-api/ActivationStatus";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";

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
  it("should return failure if an error occurs during input decode retrieve", async () => {
    const upsertSpecialServiceActivationActivity = getUpsertSpecialServiceActivationActivityHandler(
      servicesClientMock
    );
    const response = await upsertSpecialServiceActivationActivity(context, {
      aaa: "wrongActivityInput"
    });
    expect(response.kind).toBe("FAILURE");
  });

  it("should return failure if an error occurs during special service activation's upsert call", async () => {
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
    expect(response.kind).toBe("FAILURE");
    if (response.kind === "FAILURE") {
      expect(response.reason).toBe("Connectivity Error");
    }
  });

  it.each`
    error                      | expectedResponse
    ${"Not Found"}             | ${aNotFoundResponse}
    ${"Too many requests"}     | ${{ status: 429 }}
    ${"Unauthorized"}          | ${{ status: 401 }}
    ${"Forbidden"}             | ${{ status: 403 }}
    ${"Internal Server error"} | ${{ status: 500 }}
    ${"Unhandled Error"}       | ${{ status: 599 }}
  `(
    "should return failure if special service activation's upsert returns $error",
    async ({ expectedResponse }) => {
      upsertServiceActivationMock.mockImplementationOnce(() =>
        TE.of(expectedResponse)()
      );
      const upsertSpecialServiceActivationActivity = getUpsertSpecialServiceActivationActivityHandler(
        servicesClientMock
      );
      const response = await upsertSpecialServiceActivationActivity(
        context,
        anActivityInput
      );
      expect(response.kind).toBe("FAILURE");
      if (response.kind === "FAILURE") {
        expect(response.reason).toBe(
          `Cannot upsert service activation with response code ${expectedResponse.status}`
        );
      }
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
