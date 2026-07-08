import { getCriticalPoisInBbox, getCriticalPoisNear } from "@/lib/criticalPoi/criticalPoiPersistenceService";
import { getCategoriesForModule, type CriticalPoiModule } from "@/lib/criticalPoi/criticalPoiCategoryRegistry";
import type { CriticalPoi, CriticalPoiBoundingBox } from "@/lib/criticalPoi/criticalPoiTypes";

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
