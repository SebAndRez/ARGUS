import type { GeoPoint, RoutingMode } from "@/lib/routing/routingService";
import type { PlaceResult, PlaceType } from "@/lib/geocoding/geocodingService";
import type { MapEntity, MapEntityType } from "@/types/mapEntity";
import type { PoiCategory, PoiEntity } from "@/lib/pois/poiTypes";
import type { CriticalPoi, CriticalPoiCategory } from "@/lib/criticalPoi/criticalPoiTypes";

/**
 * Servicio de navegacion central: construye el link "Abrir en Google/Apple
 * Maps" (antes duplicado en `AuraQuickRouteSummary` y `NavigationHud`) y el
 * puente `MapEntity -> PlaceResult` para que cualquier ficha del mapa pueda
 * iniciar navegacion reutilizando el pipeline ya existente
 * (`useNavigationSession` + buscador + tarjetas de ruta), sin crear un
 * segundo sistema de "ir a X" por modulo.
 */

const googleMapsTravelMode: Record<RoutingMode, string> = {
  walking: "walking",
  bike: "bicycling",
  vehicle: "driving",
  emergency_vehicle: "driving",
};

export function buildExternalMapsUrl(origin: GeoPoint, destination: GeoPoint, mode: RoutingMode): string {
  const travelmode = googleMapsTravelMode[mode];
  return `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&travelmode=${travelmode}`;
}

const entityTypeToPlaceType: Partial<Record<MapEntityType, PlaceType>> = {
  hospital: "hospital",
  clinic: "clinic",
  sapu: "clinic",
  shelter: "shelter",
  safe_zone: "shelter",
};

export function mapEntityToPlaceResult(entity: MapEntity): PlaceResult {
  return {
    id: entity.id,
    label: entity.name,
    address: entity.description,
    lat: entity.lat,
    lng: entity.lng,
    type: entityTypeToPlaceType[entity.type] ?? "custom",
    provider: entity.sourceModule ? `argus_${entity.sourceModule}` : "argus_core",
    confidence: entity.isDemo ? 50 : 90,
    distanceKm: entity.distanceKm,
  };
}

export function resolveDefaultTransportMode(entity: MapEntity): RoutingMode {
  if (entity.type === "hospital" || entity.type === "clinic" || entity.type === "sapu") return "emergency_vehicle";
  return "vehicle";
}

const poiCategoryToPlaceType: Partial<Record<PoiCategory, PlaceType>> = {
  hospital: "hospital",
  clinic: "clinic",
};

/** Puente `PoiEntity -> PlaceResult`, para que "Ruta" en la ficha de un POI use el mismo pipeline de navegacion central que hospitales/refugios. */
export function poiToPlaceResult(poi: PoiEntity): PlaceResult {
  return {
    id: poi.id,
    label: poi.name,
    address: poi.address ?? poi.description,
    lat: poi.lat,
    lng: poi.lng,
    type: poiCategoryToPlaceType[poi.category] ?? "custom",
    provider: `argus_poi_${poi.source}`,
    confidence: poi.source === "osm" ? 75 : 60,
  };
}

const criticalPoiCategoryToPlaceType: Partial<Record<CriticalPoiCategory, PlaceType>> = {
  hospital: "hospital",
  clinic: "clinic",
  emergency_care: "clinic",
  shelter: "shelter",
};

/** Puente `CriticalPoi -> PlaceResult`, mismo pipeline de navegacion central. Prioridad P0/P1 -> vehiculo de emergencia por defecto. */
export function criticalPoiToPlaceResult(poi: CriticalPoi): PlaceResult {
  return {
    id: poi.id,
    label: poi.name,
    address: poi.address,
    lat: poi.lat,
    lng: poi.lng,
    type: criticalPoiCategoryToPlaceType[poi.category] ?? "custom",
    provider: `argus_critical_poi_${poi.source}`,
    confidence: poi.confidence,
  };
}

export function resolveCriticalPoiTransportMode(poi: CriticalPoi): RoutingMode {
  return poi.priority === "P0" || poi.priority === "P1" ? "emergency_vehicle" : "vehicle";
}
