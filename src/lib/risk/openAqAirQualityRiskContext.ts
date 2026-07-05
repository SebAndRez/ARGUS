import type { AirQualityObservationContext } from "@/types/airQuality";

export function buildOpenAqAirQualityRiskContext(context: AirQualityObservationContext) {
  const licenseCompletenessScore = context.riskFactors.missingProviderLicense ? 45 : 82;
  const stalenessScore = context.riskFactors.staleData ? 42 : 84;
  const providerReliabilityScore = context.providerLicense.providers.length ? 78 : 58;
  const uncertaintyScore = Math.max(10, 100 - Math.round((context.confidence + licenseCompletenessScore + stalenessScore) / 3));
  return {
    airQualityRiskContext: {
      sourceId: "openaq",
      airQualityObservationAvailability: context.measurements.length > 0,
      pm25Context: context.riskFactors.elevatedPm25Context,
      pm10Context: context.riskFactors.elevatedPm10Context,
      ozoneContext: context.riskFactors.ozoneContext,
      respiratoryExposureContext: context.riskFactors.respiratoryExposureContext,
      smokePossibleContext: context.riskFactors.smokePossibleContext,
      volcanicAshPossibleContext: context.riskFactors.volcanicAshPossibleContext,
      urbanPollutionContext: context.riskFactors.urbanPollutionContext,
      stalenessScore,
      providerReliabilityScore,
      licenseCompletenessScore,
      uncertaintyScore,
    },
    riskFactors: context.riskFactors,
    recommendedReviewActions: [
      "OpenAQ reports air quality observations near this area; review local official air quality advisories before operational decisions.",
      "Preserve provider, owner, license and staleness metadata in any Command Center briefing.",
    ],
    caveats: [
      "OpenAQ reports elevated PM2.5/PM10 near this area only when measurements support that context.",
      "ARGUS identifies air quality context that may affect respiratory exposure.",
      "Follow local health or environmental authorities for official air quality advisories.",
      "Provider/license coverage varies by location.",
      "No medical diagnosis, evacuation order or smoke-fire causal attribution is produced from OpenAQ alone.",
    ],
    evidenceRefs: context.evidenceRefs,
  };
}
