import type { NoaaNceiTsunamiEvent, NoaaNceiTsunamiRunup } from "@/lib/knowledge-intake/adapters/noaaNceiTsunamiAdapter";

export type HistoricalTsunamiSearchParams = {
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  region?: string;
  cause?: string;
  minWaterHeight?: number;
  limit?: number;
};

export type CurrentTsunamiSignal = {
  id?: string;
  latitude?: number;
  longitude?: number;
  region?: string;
  magnitude?: number;
  cause?: string;
};

function distanceKm(aLat?: number, aLon?: number, bLat?: number, bLon?: number) {
  if ([aLat, aLon, bLat, bLon].some((value) => typeof value !== "number")) return Infinity;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthKm = 6371;
  const dLat = toRad(bLat! - aLat!);
  const dLon = toRad(bLon! - aLon!);
  const lat1 = toRad(aLat!);
  const lat2 = toRad(bLat!);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthKm * Math.asin(Math.sqrt(h));
}

export function findHistoricalTsunamisNearSource(params: HistoricalTsunamiSearchParams, historicalEvents: NoaaNceiTsunamiEvent[] = []) {
  const radiusKm = params.radiusKm ?? 250;
  return historicalEvents
    .map((event) => ({
      event,
      distanceKm: distanceKm(params.latitude, params.longitude, event.sourceLatitude, event.sourceLongitude),
    }))
    .filter(({ event, distanceKm: distance }) => {
      if (params.region && event.region && !event.region.toLowerCase().includes(params.region.toLowerCase())) return false;
      if (params.cause && event.cause !== params.cause) return false;
      if (params.minWaterHeight && (event.maxWaterHeight ?? 0) < params.minWaterHeight) return false;
      if (Number.isFinite(distance) && distance > radiusKm) return false;
      return true;
    })
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, params.limit ?? 10);
}

export function findHistoricalRunupsNearCoast(params: HistoricalTsunamiSearchParams, runups: NoaaNceiTsunamiRunup[] = []) {
  const radiusKm = params.radiusKm ?? 100;
  return runups
    .map((runup) => ({
      runup,
      distanceKm: distanceKm(params.latitude, params.longitude, runup.latitude, runup.longitude),
    }))
    .filter(({ runup, distanceKm: distance }) => {
      if (params.region && runup.region && !runup.region.toLowerCase().includes(params.region.toLowerCase())) return false;
      if (params.minWaterHeight && (runup.maxWaterHeight ?? 0) < params.minWaterHeight) return false;
      if (Number.isFinite(distance) && distance > radiusKm) return false;
      return true;
    })
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, params.limit ?? 25);
}

export function buildHistoricalTsunamiContext(currentEvent: CurrentTsunamiSignal, historicalEvents: NoaaNceiTsunamiEvent[] = []) {
  const matches = findHistoricalTsunamisNearSource({
    latitude: currentEvent.latitude,
    longitude: currentEvent.longitude,
    region: currentEvent.region,
    cause: currentEvent.cause,
    radiusKm: 300,
    limit: 10,
  }, historicalEvents);
  return {
    sourceId: "noaa-ncei-tsunami",
    sourceRole: "historical_tsunami_dataset",
    isLiveSource: false,
    currentEventId: currentEvent.id,
    matchedHistoricalEvents: matches,
    caveats: [
      "Historical context only; ARGUS does not automatically merge NOAA live, USGS earthquake and NOAA/NCEI historical incidents in this phase.",
      "This is not a live warning, evacuation order or official inundation model.",
    ],
  };
}
