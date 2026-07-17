import { getCriticalPoisInBbox, getCriticalPoisNear } from "@/lib/criticalPoi/criticalPoiPersistenceService";
import { getCategoriesForModule, type CriticalPoiModule } from "@/lib/criticalPoi/criticalPoiCategoryRegistry";
import type { CriticalPoi, CriticalPoiBoundingBox } from "@/lib/criticalPoi/criticalPoiTypes";
import type { ShelterOperationalStatus } from "@/lib/criticalPoi/shelterOperationalStatusTypes";

/**
 * Punto de entrada compartido para que los modulos consulten infraestructura
 * critica por zona, sin reimplementar el filtro de categorias cada vez (ver
 * `criticalPoiCategoryRegistry.ts` -> `moduleUse`). Este es un dato
 * *complementario* de cobertura mundial via OSM: donde un modulo ya tiene su
 * propio dataset curado/verificado (AURA -> `auraMedicalPoints`, ARCA ->
 * `arcaDemoShelters`), ese dataset curado sigue siendo la fuente primaria;
 * `CriticalPoi` rellena zonas sin dato curado y da cobertura fuera de Chile.
 * Este modulo no reemplaza ni reescribe la logica interna de AURA/FENIX/ARCA/
 * NEXUS/ATLAS/VIGIA/HERMES/ORACULO — expone el dato, cada modulo decide como
 * usarlo (esa integracion profunda queda fuera de este pase).
 */

export async function getCriticalPoisForModule(
  module: CriticalPoiModule,
  bbox: CriticalPoiBoundingBox
): Promise<CriticalPoi[]> {
  const categories = getCategoriesForModule(module).map((item) => item.id);
  if (!categories.length) return [];
  return getCriticalPoisInBbox(bbox, { categories });
}

export async function getCriticalPoisForModuleNear(
  module: CriticalPoiModule,
  point: { lat: number; lng: number },
  radiusKm: number
): Promise<CriticalPoi[]> {
  const categories = getCategoriesForModule(module).map((item) => item.id);
  if (!categories.length) return [];
  return getCriticalPoisNear(point, radiusKm, { categories });
}

/** VIGIA: infraestructura critica dentro de `radiusKm` de un incidente, para cruzar riesgo/impacto. */
export async function getCriticalInfrastructureNearIncident(
  incidentPoint: { lat: number; lng: number },
  radiusKm = 3
): Promise<CriticalPoi[]> {
  return getCriticalPoisNear(incidentPoint, radiusKm, { priorities: ["P0", "P1", "P2"] });
}

/** Motivos de relacion refugio-incidente con trazabilidad explicita (spec ARGUS v1.0.3.5 §22) — nunca "todos los refugios de Chile activos para todos los incidentes". */
export type ShelterIncidentRelationReason =
  | "WITHIN_AFFECTED_AREA"
  | "NEAR_AFFECTED_AREA"
  | "OFFICIALLY_ASSOCIATED"
  | "EVACUATION_SUPPORT"
  | "WINTER_RESPONSE"
  | "MANUAL_OPERATOR_LINK";

const NEAR_AFFECTED_AREA_BUFFER_KM = 5;

function distanceKmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const earthRadiusKm = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Calcula los motivos por los que un refugio se relaciona con un incidente
 * — nunca fusiona todo el pais en una sola lista global. Solo cubre lo
 * computable de forma confiable en este pase: proximidad geometrica
 * (`WITHIN_AFFECTED_AREA`/`NEAR_AFFECTED_AREA`), programa invernal estatico
 * (`WINTER_RESPONSE`, cualquier refugio de fuente `official_open_data`
 * — hoy Codigo Azul) y vinculo manual de operador
 * (`MANUAL_OPERATOR_LINK`, via `CriticalPoiOperationalStatus.linkedIncidentId`).
 * `OFFICIALLY_ASSOCIATED`/`EVACUATION_SUPPORT` quedan fuera de este pase a
 * proposito: requeririan coincidencia de texto contra evidencia del
 * incidente o una tabla de vinculos multiples, ninguna de las dos existe
 * hoy — no se simulan con una heuristica debil.
 */
export function computeShelterIncidentReasons(
  poi: CriticalPoi,
  operationalStatus: ShelterOperationalStatus | undefined,
  incident: { id: string; lat: number; lng: number; radiusKm?: number }
): ShelterIncidentRelationReason[] {
  const reasons: ShelterIncidentRelationReason[] = [];
  const affectedRadiusKm = incident.radiusKm ?? 0;
  const distanceKm = distanceKmBetween({ lat: poi.lat, lng: poi.lng }, incident);

  if (distanceKm <= affectedRadiusKm) {
    reasons.push("WITHIN_AFFECTED_AREA");
  } else if (distanceKm <= affectedRadiusKm + NEAR_AFFECTED_AREA_BUFFER_KM) {
    reasons.push("NEAR_AFFECTED_AREA");
  }

  if (poi.source === "official_open_data") {
    reasons.push("WINTER_RESPONSE");
  }

  if (operationalStatus?.linkedIncidentId === incident.id) {
    reasons.push("MANUAL_OPERATOR_LINK");
  }

  return reasons;
}
