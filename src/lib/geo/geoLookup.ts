import { demoSettlements } from "@/data/demoSettlements";

export type GeoLookupPoint = {
  latitude: number;
  longitude: number;
};

export function distanceKm(
  a: GeoLookupPoint,
  b: GeoLookupPoint
) {
  const earthRadiusKm = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function findNearestDemoSettlement(point: GeoLookupPoint) {
  return demoSettlements
    .map((settlement) => ({
      id: settlement.id,
      name: settlement.name,
      countryCode: settlement.countryCode,
      latitude: settlement.latitude,
      longitude: settlement.longitude,
      population: settlement.population,
      distanceKm: Number(distanceKm(point, settlement).toFixed(1)),
    }))
    .sort((left, right) => left.distanceKm - right.distanceKm)[0] ?? null;
}

export function isValidCoordinate(point: GeoLookupPoint) {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180
  );
}
