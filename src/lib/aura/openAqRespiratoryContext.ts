import type { AirQualityObservationContext } from "@/types/airQuality";

export function buildOpenAqRespiratoryContext(context: AirQualityObservationContext) {
  return {
    sourceId: "openaq",
    auraRespiratoryContext: {
      available: context.measurements.length > 0,
      pollutants: {
        pm25: context.latest.pm25,
        pm10: context.latest.pm10,
        o3: context.latest.o3,
        no2: context.latest.no2,
        so2: context.latest.so2,
        co: context.latest.co,
      },
      groupsForGeneralReview: ["children", "older adults", "pregnant people", "people with respiratory conditions"],
      respiratoryExposureContext: context.riskFactors.respiratoryExposureContext,
      stalenessMinutes: context.stalenessMinutes,
      confidence: context.confidence,
    },
    generalNonMedicalActions: [
      "Review local health or environmental authority guidance.",
      "Reduce exposure if air quality appears degraded and local authorities recommend it.",
      "Seek medical attention for severe symptoms.",
    ],
    caveats: [
      "AURA uses OpenAQ for general respiratory context only.",
      "This does not diagnose, personalize treatment or replace medical care.",
      "ARGUS does not state absolute safe/unsafe status from OpenAQ alone.",
      context.providerLicense.licenseCaveat,
    ],
    evidenceRefs: context.evidenceRefs,
  };
}
