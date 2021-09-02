import { initAppInsights } from "@pagopa/ts-commons/lib/appinsights";
import { IntegerFromString } from "@pagopa/ts-commons/lib/numbers";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as ai from "applicationinsights";
import {
  EventTelemetry,
  ExceptionTelemetry
} from "applicationinsights/out/Declarations/Contracts";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";

// the internal function runtime has MaxTelemetryItem per second set to 20 by default
// @see https://github.com/Azure/azure-functions-host/blob/master/src/WebJobs.Script/Config/ApplicationInsightsLoggerOptionsSetup.cs#L29
const DEFAULT_SAMPLING_PERCENTAGE = 20;

// Avoid to initialize Application Insights more than once
export const initTelemetryClient = (env = process.env) =>
  ai.defaultClient
    ? ai.defaultClient
    : pipe(
        env.APPINSIGHTS_INSTRUMENTATIONKEY,
        NonEmptyString.decode,
        E.fold(
          _ => undefined,
          k =>
            initAppInsights(k, {
              disableAppInsights: env.APPINSIGHTS_DISABLE === "true",
              samplingPercentage: pipe(
                env.APPINSIGHTS_SAMPLING_PERCENTAGE,
                IntegerFromString.decode,
                E.getOrElse(() => DEFAULT_SAMPLING_PERCENTAGE)
              )
            })
        )
      );

export const trackEvent = (event: EventTelemetry) => {
  pipe(
    O.fromNullable(initTelemetryClient()),
    O.map(_ => O.tryCatch(() => _.trackEvent(event)))
  );
};

export const trackException = (event: ExceptionTelemetry) => {
  pipe(
    O.fromNullable(initTelemetryClient()),
    O.map(_ => O.tryCatch(() => _.trackException(event)))
  );
};
