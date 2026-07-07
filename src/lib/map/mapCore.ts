import { getNearbyPois } from "@/lib/pois/poiService";
import { getHazardMapEntities, getIncidentMapEntities } from "@/lib/incidents/incidentLayerService";
import type { CrisisEvent } from "@/types/crisis";
import type { ConflictZone } from "@/types/conflictZone";
import type { GeoPoint } from "@/lib/routing/routingService";
import type { MapEntity } from "@/types/mapEntity";

/**
 * ARGUS Map Core: punto unico de entrada para obtener todo lo que se dibuja
 * en el mapa operacional como `MapEntity` (hospitales/clinicas/refugios via
 * `poiService`, incidentes/zonas de riesgo via `incidentLayerService`).
 * Los modulos (AURA, FENIX, ATLAS, VIGIA...) no arman su propio mapa: piden
 * entidades aqui y las dibujan sobre el mismo `OperationalMap`.
 */

export interface MapCoreSources {
  events?: CrisisEvent[];
  conflictZones?: ConflictZone[];
  includePois?: boolean;
}

export function getMapEntities(userLocation: GeoPoint | undefined, sources: MapCoreSources = {}): MapEntity[] {
  const { events = [], conflictZones = [], includePois = true } = sources;
  const entities = [
    ...(includePois ? getNearbyPois(userLocation) : []),
    ...getIncidentMapEntities(events, userLocation),
    ...getHazardMapEntities(conflictZones, userLocation),
  ];
  return entities.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
}

export function findMapEntity(entities: MapEntity[], id: string): MapEntity | null {
  return entities.find((entity) => entity.id === id) ?? null;
}

export function entityToGeoPoint(entity: MapEntity): GeoPoint {
  return { lat: entity.lat, lng: entity.lng };
}
