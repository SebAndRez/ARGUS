import type { AirQualityObservationContext } from "@/types/airQuality";

export function buildOpenAqFenixContext(context: AirQualityObservationContext) {
  return {
    sourceId: "openaq",
    fenixSimulationAirQualityContext: {
      simulationUsesOpenAqAirQualityObservations: true,
      purpose: context.purpose,
      locations: context.locations,
      latest: context.latest,
      exposureContextOnly: true,
      stalenessMinutes: context.stalenessMinutes,
      providerLicense: context.providerLicense,
      riskFactors: context.riskFactors,
      confidence: context.confidence,
    },
    caveats: [
      "Fenix simulation uses OpenAQ air quality observations as context only.",
      "This is not an official health advisory, medical diagnosis or evacuation order.",
      "Route or shelter comparisons require local authority validation and additional sources.",
      context.providerLicense.licenseCaveat,
    ],
    evidenceRefs: context.evidenceRefs,
  };
}
