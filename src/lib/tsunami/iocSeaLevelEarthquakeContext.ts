import { buildIocSeaLevelTsunamiContext } from "@/lib/tsunami/iocSeaLevelTsunamiContext";

export async function buildIocSeaLevelEarthquakeContext(event: { latitude?: number | null; longitude?: number | null; incidentId?: string; radiusKm?: number }) {
  if (typeof event.latitude !== "number" || typeof event.longitude !== "number") {
    return {
      status: "invalidRequest" as const,
      context: null,
      warnings: ["Earthquake sea level context requires coordinates; no IOC SLSMF query was made."],
      errors: [],
    };
  }
  return buildIocSeaLevelTsunamiContext({
    lat: event.latitude,
    lon: event.longitude,
    radiusKm: event.radiusKm ?? 100,
    incidentId: event.incidentId,
    persist: false,
    minutes: 120,
  });
}
