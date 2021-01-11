/* tslint:disable: no-any */

import { some } from "fp-ts/lib/Option";
import { none } from "fp-ts/lib/Option";
import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import {
  CgnPendingStatus,
  StatusEnum
} from "../../generated/definitions/CgnPendingStatus";
import { UserCgn } from "../../models/user_cgn";
import { GetCgnStatusHandler } from "../handler";
const aFiscalCode = "RODFDS82S10H501T" as FiscalCode;

const findLastVersionByModelIdMock = jest.fn();
const userCgnModelMock = {
  findLastVersionByModelId: findLastVersionByModelIdMock
};

const aCgnStatus: CgnPendingStatus = {
  status: StatusEnum.PENDING
};
const aUserCgn: UserCgn = {
  fiscalCode: aFiscalCode,
  id: "A_USER_CGN_ID" as NonEmptyString,
  status: aCgnStatus
};
describe("GetCgnStatusHandler", () => {
  it("should return an internal error when a query error occurs", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      fromLeft(new Error("Query Error"))
    );
    const handler = GetCgnStatusHandler(userCgnModelMock as any);
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return not found if no userCgn is found", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(none)
    );
    const handler = GetCgnStatusHandler(userCgnModelMock as any);
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseErrorNotFound");
  });

  it("should a correct CgnStatus if a userCgn is found", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some(aUserCgn))
    );
    const handler = GetCgnStatusHandler(userCgnModelMock as any);
    const response = await handler({} as any, aFiscalCode);
    expect(response.kind).toBe("IResponseSuccessJson");
    if (response.kind === "IResponseSuccessJson") {
      expect(response.value).toEqual({
        ...aCgnStatus
      });
    }
  });
});
