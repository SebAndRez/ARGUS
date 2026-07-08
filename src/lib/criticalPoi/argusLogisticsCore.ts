import { getCriticalPoisInBbox } from "@/lib/criticalPoi/criticalPoiPersistenceService";
import type { CriticalPoi, CriticalPoiBoundingBox, CriticalPriority } from "@/lib/criticalPoi/criticalPoiTypes";

/**
 * ARGUS Logistics Center: analisis de infraestructura critica para una zona
 * (el viewport visible del mapa, o un bbox pasado explicitamente — no hay
 * dibujo de poligono libre en esta fase). Reutiliza el mismo dato persistente
 * de `CriticalPoi`; no trae nada de OSM en vivo aca. Para "Ruta" real hacia
 * un punto puntual se usa el motor de navegacion central (ver
 * `src/lib/navigation/navigationService.ts` + `poiToPlaceResult`/
 * `criticalPoiToPlaceResult`), no un routing aislado por zona — escanear una
 * zona entera con rutas reales por calle para cada punto no es viable ni
 * necesario; aca se estima con distancia en linea recta para priorizar,
 * y la ruta real se calcula on-demand cuando el usuario elige un punto.
 */

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const radiusKm = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * radiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

function bboxCenter(bbox: CriticalPoiBoundingBox) {
  return { lat: (bbox.south + bbox.north) / 2, lng: (bbox.west + bbox.east) / 2 };
}

export interface ZoneAnalysis {
  bbox: CriticalPoiBoundingBox;
  center: { lat: number; lng: number };
  total: number;
  byPriority: Record<CriticalPriority, number>;
  byCategory: Record<string, number>;
  nearestByCategory: Record<string, { poi: CriticalPoi; distanceKm: number } | null>;
}

/** 1. Seleccionar una zona (bbox del viewport) y ver infraestructura critica alrededor. */
export async function analyzeZone(bbox: CriticalPoiBoundingBox): Promise<ZoneAnalysis> {
  const pois = await getCriticalPoisInBbox(bbox, { limit: 1000 });
  const center = bboxCenter(bbox);
  const withDistance = pois.map((poi) => ({ poi, distanceKm: haversineKm(center, poi) }));

  const byPriority: Record<CriticalPriority, number> = { P0: 0, P1: 0, P2: 0, P3: 0, P4: 0 };
  const byCategory: Record<string, number> = {};
  const nearestByCategory: Record<string, { poi: CriticalPoi; distanceKm: number } | null> = {};

  withDistance.forEach(({ poi, distanceKm }) => {
    byPriority[poi.priority] += 1;
    byCategory[poi.category] = (byCategory[poi.category] ?? 0) + 1;
    const current = nearestByCategory[poi.category];
    if (!current || distanceKm < current.distanceKm) nearestByCategory[poi.category] = { poi, distanceKm };
  });

  return { bbox, center, total: pois.length, byPriority, byCategory, nearestByCategory };
}

export interface CoverageGap {
  cellCenter: { lat: number; lng: number };
  missingCategories: string[];
}

const COVERAGE_CRITICAL_CATEGORIES = ["hospital", "police_station", "fire_station"] as const;

/** 3. Detectar vacios de cobertura: celdas de la zona sin hospital/policia/bomberos a menos de `thresholdKm`. */
export async function detectCoverageGaps(
  bbox: CriticalPoiBoundingBox,
  gridSizeKm = 5,
  thresholdKm = 5
): Promise<CoverageGap[]> {
  const pois = await getCriticalPoisInBbox(bbox, { categories: [...COVERAGE_CRITICAL_CATEGORIES] });
  const latStepDeg = gridSizeKm / 111;
  const lngStepDeg = gridSizeKm / (111 * Math.max(Math.cos((bboxCenter(bbox).lat * Math.PI) / 180), 0.2));

  const gaps: CoverageGap[] = [];
  for (let lat = bbox.south; lat < bbox.north; lat += latStepDeg) {
    for (let lng = bbox.west; lng < bbox.east; lng += lngStepDeg) {
      const cellCenter = { lat: lat + latStepDeg / 2, lng: lng + lngStepDeg / 2 };
      const missingCategories = COVERAGE_CRITICAL_CATEGORIES.filter(
        (category) => !pois.some((poi) => poi.category === category && haversineKm(cellCenter, poi) <= thresholdKm)
      );
      if (missingCategories.length > 0) gaps.push({ cellCenter, missingCategories });
    }
  }
  return gaps;
}

export interface AssemblyPointSuggestion {
  poi: CriticalPoi;
  distanceFromCenterKm: number;
  reason: string;
}

/** 4. Sugerir puntos de reunion/acopio: refugios, colegios, estadios y centros de acopio de la zona, mas cercanos al centro primero. Heuristica simple por distancia, no un modelo de poblacion. */
export async function suggestAssemblyPoints(bbox: CriticalPoiBoundingBox, limit = 10): Promise<AssemblyPointSuggestion[]> {
  const pois = await getCriticalPoisInBbox(bbox, {
    categories: ["shelter", "school", "stadium", "supply_center", "logistics_center"],
  });
  const center = bboxCenter(bbox);

  return pois
    .map((poi) => ({
      poi,
      distanceFromCenterKm: haversineKm(center, poi),
      reason:
        poi.category === "shelter"
          ? "Refugio mapeado en la zona"
          : poi.category === "school"
            ? "Colegio: capacidad de acogida y accesibilidad conocidas"
            : poi.category === "stadium"
              ? "Estadio: gran capacidad para punto de reunión masivo"
              : "Centro de acopio/logística cercano",
    }))
    .sort((a, b) => a.distanceFromCenterKm - b.distanceFromCenterKm)
    .slice(0, limit);
}

/** 5. Priorizar entidades por emergencia: reordena la infraestructura de la zona segun que categorias importan mas para el tipo de emergencia dado. */
export function prioritizeForEmergency(
  analysis: ZoneAnalysis,
  emergencyType: "medical" | "fire" | "security" | "evacuation" | "supply"
): string[] {
  const order: Record<typeof emergencyType, string[]> = {
    medical: ["hospital", "emergency_care", "clinic", "pharmacy"],
    fire: ["fire_station", "hospital", "police_station"],
    security: ["police_station", "government_building", "courthouse"],
    evacuation: ["shelter", "school", "stadium", "bus_terminal", "train_station"],
    supply: ["supply_center", "logistics_center", "bus_terminal", "train_station"],
  };
  return order[emergencyType].filter((category) => (analysis.byCategory[category] ?? 0) > 0);
}
