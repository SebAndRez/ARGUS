import type { MedicalPoint } from "@/types/medical";

export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
) {
  const radiusKm = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * radiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function sortMedicalPointsByDistance(
  points: MedicalPoint[],
  location: { latitude: number; longitude: number }
) {
  return points
    .map((point) => ({
      ...point,
      distanceKm: distanceKm(location, {
        latitude: point.latitude,
        longitude: point.longitude,
      }),
    }))
    .sort((left, right) => (left.distanceKm ?? 0) - (right.distanceKm ?? 0));
}
