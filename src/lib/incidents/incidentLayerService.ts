import type { CrisisEvent, EventSeverity } from "@/types/crisis";
import type { ConflictZone, ConflictCoordinates } from "@/types/conflictZone";
import type { GeoPoint } from "@/lib/routing/routingService";
import type { MapEntity, MapEntityPriority, MapEntityStatus } from "@/types/mapEntity";

/**
 * Convierte eventos/reportes (VIGIA) y zonas de riesgo/conflicto (TALOS/ATLAS)
 * en `MapEntity` para el mapa operacional. No reemplaza `CrisisEvent`/
 * `ConflictZone` como modelo de datos: solo los adapta para que el mapa y la
 * ficha compacta (`MapEntityCard`) los entiendan de forma generica.
 */

function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const radiusKm = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * radiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

const severityToPriority: Record<EventSeverity, MapEntityPriority> = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
};

function eventStatusToEntityStatus(status: string): MapEntityStatus {
  if (status === "RESOLVED") return "resolved";
  if (status === "DISCARDED") return "closed";
  return "active";
}

function categoryToEntityType(event: CrisisEvent): MapEntity["type"] {
  const category = event.category?.toLowerCase() ?? "";
  if (category.includes("fire")) return "fire";
  if (category.includes("flood")) return "flood";
  if (category.includes("earthquake") || category.includes("sismo")) return "earthquake";
  return "incident";
}

export function crisisEventToMapEntity(event: CrisisEvent, userLocation?: GeoPoint): MapEntity {
  return {
    id: `event-${event.id}`,
    type: categoryToEntityType(event),
    name: event.title,
    description: event.description,
    lat: event.latitude,
    lng: event.longitude,
    status: eventStatusToEntityStatus(event.status),
    priority: severityToPriority[event.severity],
    sourceModule: "vigia",
    isDemo: Boolean(event.isDemo),
    distanceKm: userLocation
      ? haversineKm(userLocation, { lat: event.latitude, lng: event.longitude })
      : undefined,
    refId: event.id,
  };
}

const zoneTypeToEntityType: Partial<Record<ConflictZone["zoneType"], MapEntity["type"]>> = {
  disaster_confirmed: "hazard",
};

const riskLevelToPriority: Record<ConflictZone["riskLevel"], MapEntityPriority> = {
  low: "low",
  medium: "medium",
  high: "high",
  critical: "critical",
};

function conflictZoneCenter(coordinates: ConflictCoordinates): GeoPoint | null {
  if (!Array.isArray(coordinates)) {
    return { lat: (coordinates.north + coordinates.south) / 2, lng: (coordinates.east + coordinates.west) / 2 };
  }
  if (typeof coordinates[0] === "number") {
    const [lat, lng] = coordinates as [number, number];
    return { lat, lng };
  }
  const pairs = coordinates as Array<[number, number]>;
  if (pairs.length === 0) return null;
  const sum = pairs.reduce((acc, [lat, lng]) => ({ lat: acc.lat + lat, lng: acc.lng + lng }), { lat: 0, lng: 0 });
  return { lat: sum.lat / pairs.length, lng: sum.lng / pairs.length };
}

/** Zonas de riesgo/conflicto activas como MapEntity tipo "hazard"/"conflict" para la ficha "Ver capa / Ruta segura / Abrir ATLAS". */
export function conflictZoneToMapEntity(zone: ConflictZone, userLocation?: GeoPoint): MapEntity | null {
  const center = conflictZoneCenter(zone.coordinates);
  if (!center) return null;
  return {
    id: `zone-${zone.id}`,
    type: zoneTypeToEntityType[zone.zoneType] ?? "conflict",
    name: zone.name,
    description: zone.summary,
    lat: center.lat,
    lng: center.lng,
    status: zone.isActive ? "active" : "resolved",
    priority: riskLevelToPriority[zone.riskLevel],
    sourceModule: "atlas",
    isDemo: false,
    distanceKm: userLocation ? haversineKm(userLocation, center) : undefined,
    refId: zone.id,
  };
}

export function getIncidentMapEntities(events: CrisisEvent[], userLocation?: GeoPoint): MapEntity[] {
  return events.map((event) => crisisEventToMapEntity(event, userLocation));
}

export function getHazardMapEntities(zones: ConflictZone[], userLocation?: GeoPoint): MapEntity[] {
  return zones
    .map((zone) => conflictZoneToMapEntity(zone, userLocation))
    .filter((entity): entity is MapEntity => entity !== null);
}
