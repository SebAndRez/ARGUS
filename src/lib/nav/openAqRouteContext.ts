import type { AirQualityObservationContext } from "@/types/airQuality";

export function buildOpenAqRouteContext(context: AirQualityObservationContext) {
  return {
    sourceId: "openaq",
    navAirExposureContext: {
      available: context.measurements.length > 0,
      routeAnalysisId: context.query.routeAnalysisId,
      latest: context.latest,
      respiratoryExposureContext: context.riskFactors.respiratoryExposureContext,
      smokePossibleContext: context.riskFactors.smokePossibleContext,
      stalenessMinutes: context.stalenessMinutes,
      confidence: context.confidence,
      providerLicense: context.providerLicense,
    },
    routeReviewActions: [
      "Use OpenAQ as context when comparing alternatives with other operational constraints.",
      "Do not declare a route medically safe or officially closed from one air quality observation.",
    ],
    routeCaveats: [
      "OpenAQ does not officially close roads or guarantee a route is safe for health.",
      "Air exposure routing remains a prepared future capability and needs local authority validation.",
      context.providerLicense.licenseCaveat,
    ],
    evidenceRefs: context.evidenceRefs,
  };
}
