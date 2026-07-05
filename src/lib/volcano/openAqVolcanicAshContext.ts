import {
  fetchAndBuildOpenAqAirQualityObservationContext,
  type OpenAqRequestParams,
} from "@/lib/knowledge-intake/adapters/openAqAdapter";

export async function buildOpenAqVolcanicAshContext(event: { id?: string; latitude?: number; longitude?: number; incidentId?: string }, params: Partial<OpenAqRequestParams> = {}) {
  if (typeof event.latitude !== "number" || typeof event.longitude !== "number") {
    return { status: "invalidRequest" as const, context: null, warnings: ["latitude/longitude required for OpenAQ volcanic ash context"], errors: [] };
  }
  const result = await fetchAndBuildOpenAqAirQualityObservationContext({
    lat: event.latitude,
    lon: event.longitude,
    radiusKm: params.radiusKm ?? 25,
    parameters: params.parameters ?? ["pm10", "pm25", "so2"],
    purpose: "volcanic_ash_context",
    incidentId: event.incidentId,
    includeLatest: true,
    includeSensors: true,
    includeProviders: true,
    includeOwners: true,
    includeLicenses: true,
  });
  return {
    ...result,
    caveats: [
      "OpenAQ PM/SO2 near a volcano is air quality context only.",
      "ARGUS does not confirm volcanic ash or causal attribution from isolated PM/SO2 measurements.",
      "Follow local volcano, health and environmental authorities for official advisories.",
    ],
  };
}
