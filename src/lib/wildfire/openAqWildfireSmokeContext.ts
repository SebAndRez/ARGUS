import {
  fetchAndBuildOpenAqAirQualityObservationContext,
  type OpenAqRequestParams,
} from "@/lib/knowledge-intake/adapters/openAqAdapter";

export async function buildOpenAqWildfireSmokeContext(event: { id?: string; latitude?: number; longitude?: number; incidentId?: string }, params: Partial<OpenAqRequestParams> = {}) {
  if (typeof event.latitude !== "number" || typeof event.longitude !== "number") {
    return { status: "invalidRequest" as const, context: null, warnings: ["latitude/longitude required for OpenAQ wildfire smoke context"], errors: [] };
  }
  const result = await fetchAndBuildOpenAqAirQualityObservationContext({
    lat: event.latitude,
    lon: event.longitude,
    radiusKm: params.radiusKm ?? 25,
    parameters: params.parameters ?? ["pm25", "pm10", "o3"],
    purpose: "wildfire_smoke_context",
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
      "OpenAQ PM2.5/PM10/O3 near a wildfire is smoke exposure context only.",
      "ARGUS does not infer that particulate matter came from a specific fire without additional correlation.",
      "Follow local health and environmental authorities for official advisories.",
    ],
  };
}
