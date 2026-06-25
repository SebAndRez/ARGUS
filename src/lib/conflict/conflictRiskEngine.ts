import type {
  ConflictEvent,
  ConflictProximityWarning,
  ConflictZone,
} from "@/types/conflictZone";

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

export function getConflictZoneCenter(zone: ConflictZone) {
  if (zone.geometryType === "point" && Array.isArray(zone.coordinates)) {
    const [latitude, longitude] = zone.coordinates as [number, number];
    return { latitude, longitude };
  }
  if (zone.geometryType === "bbox" && !Array.isArray(zone.coordinates)) {
    return {
      latitude: (zone.coordinates.north + zone.coordinates.south) / 2,
      longitude: (zone.coordinates.east + zone.coordinates.west) / 2,
    };
  }
  const points = zone.coordinates as Array<[number, number]>;
  const totals = points.reduce(
    (sum, [latitude, longitude]) => ({
      latitude: sum.latitude + latitude,
      longitude: sum.longitude + longitude,
    }),
    { latitude: 0, longitude: 0 }
  );
  return {
    latitude: totals.latitude / Math.max(1, points.length),
    longitude: totals.longitude / Math.max(1, points.length),
  };
}

function warningLevel(distance: number): ConflictProximityWarning["level"] {
  if (distance <= 10) return "critical";
  if (distance <= 25) return "danger";
  if (distance <= 50) return "warning";
  return "info";
}

function isConflictWarning(
  warning: ConflictProximityWarning | null
): warning is ConflictProximityWarning {
  return Boolean(warning);
}

export function getConflictProximityWarnings(
  userLocation: { latitude: number; longitude: number },
  activeZones: ConflictZone[],
  activeEvents: ConflictEvent[]
): ConflictProximityWarning[] {
  const zoneWarnings = activeZones
    .filter((zone) => zone.isActive)
    .map<ConflictProximityWarning | null>((zone) => {
      const center = getConflictZoneCenter(zone);
      const distance = distanceKm(userLocation, center);
      if (distance > 50) return null;
      return {
        id: `zone:${zone.id}`,
        level: warningLevel(distance),
        distanceKm: distance,
        title: "Advertencia ARGUS",
        reason: `Se encuentra a ${distance.toFixed(0)} km de ${zone.name}: ${zone.summary}`,
        recommendedAction:
          zone.recommendedAction ||
          "Evite desplazamientos no esenciales y verifique fuentes oficiales.",
        zone,
      } satisfies ConflictProximityWarning;
    })
    .filter(isConflictWarning);

  const eventWarnings = activeEvents
    .map<ConflictProximityWarning | null>((event) => {
      const distance = distanceKm(userLocation, {
        latitude: event.lat,
        longitude: event.lng,
      });
      if (distance > 100 || !["high", "critical"].includes(event.severity)) {
        return null;
      }
      return {
        id: `event:${event.id}`,
        level: distance <= 25 ? "danger" : "warning",
        distanceKm: distance,
        title: "Advertencia ARGUS",
        reason: `Evento critico reciente a ${distance.toFixed(0)} km: ${event.title}.`,
        recommendedAction:
          "Evite transito no esencial y confirme con fuentes oficiales antes de desplazarse.",
        event,
      } satisfies ConflictProximityWarning;
    })
    .filter(isConflictWarning);

  return [...zoneWarnings, ...eventWarnings].sort(
    (left, right) => left.distanceKm - right.distanceKm
  );
}
