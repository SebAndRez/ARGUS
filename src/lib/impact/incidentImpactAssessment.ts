import type { ArgusConfidence, ArgusEventType, ArgusGeometry, ArgusSeverity } from "@/types/argusEvent";
import type { ModuleIncidentSummary } from "@/types/moduleOperationalContext";
import type { CriticalPoi } from "@/lib/criticalPoi/criticalPoiTypes";
import { priorityRank } from "@/lib/criticalPoi/criticalPoiTypes";
import { getCriticalInfrastructureNearIncident } from "@/lib/criticalPoi/criticalPoiModuleQueries";
import { representativePoint } from "@/lib/canonical/canonicalReadLayer";
import {
  distanceToGeometryBoundaryKm,
  haversineDistanceKm,
  type RawGeometry,
} from "@/lib/geometry/wildfireGeometry";
import type {
  ImpactPriorityLevel,
  ImpactSpatialRelation,
  ImpactedInfrastructureAsset,
  IncidentImpactAssessment,
  InfrastructureImpactResult,
  OperationalPriorityResult,
  PopulationExposureResult,
  RouteImpactResult,
  ServiceDependencyResult,
  SuggestedImpactAction,
} from "@/types/incidentImpactAssessment";

/**
 * ARGUS — análisis de impacto geoespacial de un incidente canónico
 * (Prompt 6). Deliberadamente no crea un "Impact Engine" aislado: es una
 * función pura de agregación sobre capacidades ya reales del repo,
 * confirmadas por auditoría antes de escribir esta implementación —
 * `docs/architecture/ARGUS_IMPACT_ASSESSMENT_IMPLEMENTATION.md` §1 documenta
 * qué existía, qué era demo, y por qué cada pieza de abajo se reutiliza tal
 * cual en vez de reimplementarse:
 *
 * - `getCriticalInfrastructureNearIncident` (`criticalPoiModuleQueries.ts`):
 *   consulta real, ya existente, contra `CriticalPoi` (Prisma) — estaba
 *   escrita pero sin ningún consumidor (huérfana). Este módulo es su primer
 *   consumidor real.
 * - `pointInGeometry`/`distanceToGeometryBoundaryKm` (`wildfireGeometry.ts`):
 *   primitivas de punto-en-polígono ya existentes (Prompt 15) — se reutilizan
 *   tal cual, sin escribir una segunda implementación de geometría.
 * - `representativePoint` (`canonicalReadLayer.ts`, Prompt 3/5): mismo punto
 *   representativo que ya usa la capa canónica de lectura para correlación,
 *   reutilizado aquí para no derivar un segundo punto desde el mismo
 *   `ArgusGeometry`.
 *
 * Explícitamente NO reutiliza (documentado como decisión, no como olvido):
 * `src/lib/fenix/populationExposureEstimator.ts` /
 * `src/lib/fenix/fenixGeoContextEngine.ts` — ambos son motores de simulación
 * FÉNIX operando sobre datos 100% demo (`demoSettlements`, densidad fija
 * global), confirmado por auditoría previa a esta implementación. Conectar
 * un estimador demo a un incidente REAL presentaría una cifra sin respaldo
 * como si fuera un resultado del incidente — exactamente lo que el mandato
 * prohíbe (§17, §41). Población expuesta se declara `NOT_AVAILABLE` en su
 * lugar (§17: "NO CALCULADO es preferible a inventar una zona").
 */

export const IMPACT_ASSESSMENT_VERSION = "1.0.0";

/**
 * Radio operacional de búsqueda de infraestructura cercana por tipo de
 * evento — nunca el área oficial de daño/afectación, solo el radio de
 * prefiltrado para `getCriticalInfrastructureNearIncident`. Sin ShakeMap,
 * perímetro real de incendio o zona SHOA conectados a este pase (ver deuda
 * técnica), un radio universal sería exactamente lo que el mandato prohíbe
 * (§12: "5km para todo... sin base documentada"). Cada valor es una decisión
 * operacional explícita — más amplio para amenazas de propagación (incendio,
 * volcán, tsunami costero), más ceñido para eventos puntuales — anclado al
 * radio por defecto que `getCriticalInfrastructureNearIncident` ya usa en
 * producción (3km) para los tipos sin regla específica.
 */
const SEARCH_RADIUS_KM_BY_EVENT_TYPE: Partial<Record<ArgusEventType, number>> = {
  EARTHQUAKE: 5,
  TSUNAMI: 2,
  WILDFIRE: 8,
  FLOOD: 5,
  LANDSLIDE: 3,
  VOLCANIC_ACTIVITY: 6,
  SEVERE_WEATHER: 4,
  HEAVY_RAIN: 4,
};
const DEFAULT_SEARCH_RADIUS_KM = 3;

/** Distancia al borde de la geometría real dentro de la cual un activo se considera BORDER, no NEAR. */
const BORDER_BUFFER_KM = 1;

const SEVERITY_RANK: Record<ArgusSeverity, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
const CONFIDENCE_RANK: Record<ArgusConfidence, number> = { low: 0, medium: 1, medium_high: 2, high: 3, verified: 4 };

/**
 * Convierte la geometría de área real de un incidente (cuando existe) al
 * formato que `wildfireGeometry.ts` espera, para reutilizar sus primitivas en
 * vez de escribir una segunda implementación de punto-en-polígono.
 * `region_reference.polygonEstimate` se excluye deliberadamente: su propio
 * docstring en `argusEvent.ts` lo declara "nunca un límite oficial" — tratarlo
 * como geometría real produciría clasificaciones INSIDE/BORDER falsas.
 */
function toRawGeometry(geometry: ArgusGeometry): RawGeometry | null {
  if (geometry.type === "administrative_area") {
    return geometry.geojson;
  }
  if (geometry.type === "polygon") {
    const ring = geometry.coordinates.map(([lat, lng]) => [lng, lat] as [number, number]);
    return { type: "Polygon", coordinates: [ring] };
  }
  return null;
}

function classifyAsset(
  poi: CriticalPoi,
  incidentPoint: { lat: number; lng: number },
  rawGeometry: RawGeometry | null,
  searchRadiusKm: number
): { relation: ImpactSpatialRelation; distanceKm: number | null } {
  const assetPoint = { lat: poi.lat, lng: poi.lng };

  if (rawGeometry) {
    const distance = distanceToGeometryBoundaryKm(assetPoint, rawGeometry);
    if (distance === null) return { relation: "NOT_DETERMINED", distanceKm: null };
    if (distance === 0) return { relation: "INSIDE", distanceKm: 0 };
    if (distance <= BORDER_BUFFER_KM) return { relation: "BORDER", distanceKm: distance };
    if (distance <= searchRadiusKm) return { relation: "NEAR", distanceKm: distance };
    return { relation: "OUTSIDE", distanceKm: distance };
  }

  // getCriticalInfrastructureNearIncident queries a rectangular bbox derived
  // from searchRadiusKm, not a true circle — corner results can exceed the
  // radius, so this re-checks the real great-circle distance rather than
  // trusting every row the bbox query returned.
  const distance = haversineDistanceKm(assetPoint, incidentPoint);
  if (distance <= searchRadiusKm) return { relation: "NEAR", distanceKm: distance };
  return { relation: "OUTSIDE", distanceKm: distance };
}

function verificationRecommendationFor(poi: CriticalPoi, relation: ImpactSpatialRelation): string {
  if (relation === "INSIDE") {
    return `Verificar estado operacional de ${poi.name} — dentro del área geométrica del incidente. Requiere verificación, no se afirma un estado.`;
  }
  if (relation === "BORDER") {
    return `Verificar estado operacional de ${poi.name} — en el borde del área geométrica del incidente.`;
  }
  return `Confirmar disponibilidad de ${poi.name} — cercano al incidente; riesgo de acceso no confirmado.`;
}

async function buildInfrastructureImpact(
  incident: ModuleIncidentSummary,
  point: { lat: number; lng: number }
): Promise<InfrastructureImpactResult> {
  const searchRadiusKm = SEARCH_RADIUS_KM_BY_EVENT_TYPE[incident.type] ?? DEFAULT_SEARCH_RADIUS_KM;
  const rawGeometry = toRawGeometry(incident.location.geometry);
  const pois = await getCriticalInfrastructureNearIncident(point, searchRadiusKm);

  const classified = pois
    .map((poi) => ({ poi, ...classifyAsset(poi, point, rawGeometry, searchRadiusKm) }))
    .filter((entry) => entry.relation === "INSIDE" || entry.relation === "BORDER" || entry.relation === "NEAR")
    .sort(
      (a, b) =>
        priorityRank[a.poi.priority] - priorityRank[b.poi.priority] || (a.distanceKm ?? 0) - (b.distanceKm ?? 0)
    );

  const assets: ImpactedInfrastructureAsset[] = classified.map(({ poi, relation, distanceKm }) => ({
    poiId: poi.id,
    name: poi.name,
    category: poi.category,
    priority: poi.priority,
    spatialRelation: relation,
    distanceKm: distanceKm === null ? null : Math.round(distanceKm * 100) / 100,
    verificationRecommendation: verificationRecommendationFor(poi, relation),
  }));

  return {
    dataState: "CALCULATED",
    searchRadiusKm,
    searchRadiusRationale: rawGeometry
      ? "Radio usado solo para el prefiltrado de la consulta; la clasificación INSIDE/BORDER usa la geometría real del incidente, no este radio."
      : `Incidente sin geometría de área real — todo activo encontrado se clasifica como NEAR dentro de ${searchRadiusKm}km, nunca INSIDE/BORDER (evita implicar una precisión de área que no existe).`,
    assets,
    usedRealAreaGeometry: Boolean(rawGeometry),
  };
}

function buildPopulationExposure(): PopulationExposureResult {
  return {
    dataState: "NOT_AVAILABLE",
    estimatedRangeLow: null,
    estimatedRangeHigh: null,
    methodology: "N/A",
    reason:
      "Sin fuente censal/administrativa real conectada a incidentes canónicos. El único estimador existente en el repo (src/lib/fenix/populationExposureEstimator.ts) usa densidad fija global y asentamientos demo, exclusivo del simulador FÉNIX — reutilizarlo aquí presentaría una cifra sin respaldo real como si fuera un resultado del incidente. NOT_AVAILABLE es preferible a una cifra inventada.",
  };
}

function buildRouteImpact(): RouteImpactResult {
  return {
    dataState: "NOT_AVAILABLE",
    reason:
      "No existe un registro de rutas indexado por área geográfica conectado a incidentes canónicos. routeSafety.ts puntúa una ruta específica que el llamador debe proveer explícitamente; no hay hoy una consulta 'qué rutas cruzan esta geometría' equivalente a la de infraestructura.",
  };
}

function buildServiceDependencies(): ServiceDependencyResult {
  return {
    dataState: "NOT_AVAILABLE",
    reason:
      "Ningún módulo de ARGUS (TALOS/FÉNIX/AURA/ARCA/HERMES, confirmado por auditoría) modela dependencias entre activos (p.ej. hospital→energía). Declarar una dependencia sin procedencia real violaría la regla explícita del mandato de no hardcodear relaciones sin procedencia.",
  };
}

function computeOperationalPriority(
  incident: ModuleIncidentSummary,
  infrastructure: InfrastructureImpactResult
): OperationalPriorityResult {
  const severityScore = (SEVERITY_RANK[incident.severity] / 4) * 100;
  const confidenceScore = (CONFIDENCE_RANK[incident.confidence] / 4) * 100;
  const exposureCount = infrastructure.assets.filter(
    (asset) => asset.spatialRelation === "INSIDE" || asset.spatialRelation === "BORDER"
  ).length;
  // 5+ inside/border assets saturates the exposure component at 100.
  const exposureScore = Math.min(100, exposureCount * 20);

  // Severity is the primary driver; confidence tempers but never zeroes it
  // out (Prompt 6 §26: low confidence must not turn a severe incident
  // irrelevant), exposure adds real-asset urgency on top.
  const score = Math.round(severityScore * 0.5 + confidenceScore * 0.2 + exposureScore * 0.3);
  const level: ImpactPriorityLevel = score >= 75 ? "critical" : score >= 50 ? "high" : score >= 25 ? "medium" : "low";

  return {
    level,
    score,
    methodology:
      "score = severidad_incidente*0.5 + confianza_incidente*0.2 + exposición_infraestructura*0.3, cada componente normalizado 0-100 (severidad/confianza por rango ordinal ya canónico, exposición por conteo de activos INSIDE/BORDER saturado en 5). Nunca usa población/rutas (NOT_AVAILABLE en este pase).",
    factors: [
      { label: "Severidad del incidente", value: incident.severity },
      { label: "Confianza del incidente", value: incident.confidence },
      { label: "Infraestructura crítica dentro/borde del área", value: String(exposureCount) },
    ],
  };
}

function buildSuggestedActions(
  infrastructure: InfrastructureImpactResult,
  priority: OperationalPriorityResult
): SuggestedImpactAction[] {
  const actions: SuggestedImpactAction[] = [];
  const insideOrBorder = infrastructure.assets.filter(
    (asset) => asset.spatialRelation === "INSIDE" || asset.spatialRelation === "BORDER"
  );
  const near = infrastructure.assets.filter((asset) => asset.spatialRelation === "NEAR");

  if (insideOrBorder.length > 0) {
    actions.push({
      action: `Verificar estado operacional de ${insideOrBorder.length} activo(s) crítico(s) dentro/en el borde del área del incidente.`,
      reason: "Relación espacial calculada contra la geometría real del incidente.",
      priority: priority.level,
      status: "SUGGESTED",
      relatedAssetIds: insideOrBorder.map((asset) => asset.poiId),
    });
  } else if (near.length > 0) {
    actions.push({
      action: `Confirmar disponibilidad de ${near.length} activo(s) crítico(s) cercanos al incidente.`,
      reason: `Encontrados dentro del radio operacional de búsqueda (${infrastructure.searchRadiusKm}km); sin geometría de área real para confirmar exposición directa.`,
      priority: priority.level,
      status: "SUGGESTED",
      relatedAssetIds: near.map((asset) => asset.poiId),
    });
  }

  if (infrastructure.assets.length === 0 && infrastructure.dataState === "CALCULATED") {
    actions.push({
      action: "Solicitar verificación de campo — sin infraestructura crítica persistida encontrada en el radio operacional.",
      reason: "No implica ausencia real de infraestructura, solo ausencia en el catálogo CriticalPoi para esta zona.",
      priority: "low",
      status: "PENDING_VALIDATION",
    });
  }

  if (priority.level === "critical" || priority.level === "high") {
    actions.push({
      action: "Escalar a operador para revisión prioritaria.",
      reason: `Prioridad operacional ${priority.level} (score ${priority.score}/100).`,
      priority: priority.level,
      status: "PENDING_VALIDATION",
    });
  }

  return actions;
}

export interface BuildIncidentImpactAssessmentOptions {
  /** Reloj inyectable para tests deterministas — por defecto `new Date()`. */
  now?: Date;
}

/**
 * Punto de entrada único. Recibe un `ModuleIncidentSummary` ya resuelto por
 * `getModuleIncidentDetailContext` (Prompt 17, el mismo contrato que ya usan
 * los cuatro dashboards) — nunca resuelve el incidente por su cuenta ni
 * acepta un id crudo, para no introducir una segunda forma de resolver
 * "incidente por id" en el repo.
 */
export async function buildIncidentImpactAssessment(
  incident: ModuleIncidentSummary,
  options: BuildIncidentImpactAssessmentOptions = {}
): Promise<IncidentImpactAssessment> {
  const now = options.now ?? new Date();
  const point = representativePoint(incident.location.geometry);
  const limitations: string[] = [];

  const infrastructure: InfrastructureImpactResult = point
    ? await buildInfrastructureImpact(incident, point)
    : {
        dataState: "NOT_AVAILABLE",
        searchRadiusKm: 0,
        searchRadiusRationale: "El incidente no tiene un punto representativo resoluble.",
        assets: [],
        usedRealAreaGeometry: false,
      };
  if (infrastructure.dataState === "NOT_AVAILABLE") {
    limitations.push("Infraestructura crítica: no calculada — geometría del incidente sin punto representativo.");
  }

  const population = buildPopulationExposure();
  limitations.push(`Población expuesta: ${population.reason}`);

  const routes = buildRouteImpact();
  limitations.push(`Rutas afectadas: ${routes.reason}`);

  const services = buildServiceDependencies();
  limitations.push(`Servicios y dependencias: ${services.reason}`);

  const priority = computeOperationalPriority(incident, infrastructure);
  const suggestedActions = buildSuggestedActions(infrastructure, priority);

  return {
    incidentId: incident.id,
    generatedAt: now.toISOString(),
    assessmentVersion: IMPACT_ASSESSMENT_VERSION,
    incidentSeverity: incident.severity,
    incidentConfidence: incident.confidence,
    infrastructure,
    population,
    routes,
    services,
    priority,
    suggestedActions,
    limitations,
    isDemo: Boolean(incident.isDemo),
  };
}
