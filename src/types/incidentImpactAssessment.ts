import type { ArgusConfidence, ArgusSeverity } from "@/types/argusEvent";
import type { CriticalPoiCategory, CriticalPriority } from "@/lib/criticalPoi/criticalPoiTypes";

/**
 * ARGUS — contrato de análisis de impacto geoespacial (Prompt 6).
 *
 * Deliberadamente NO un segundo modelo de incidente: un resultado derivado,
 * de solo lectura, calculado a partir de un `ArgusEvent` ya resuelto por
 * `getModuleIncidentDetailContext` (Prompt 17) — nunca se persiste como un
 * incidente nuevo, nunca introduce su propia severidad/confianza/geometría.
 * `severity`/`confidence`/`geometryPrecision` se leen del incidente, no se
 * recalculan aquí.
 *
 * Cada campo derivado declara su propio `dataState` (§3 del mandato) porque
 * la calidad de evidencia difiere por dimensión: la infraestructura cercana
 * puede ser CALCULATED (geometría real + consulta real a la base) mientras
 * la población expuesta es NOT_AVAILABLE (sin fuente censal/administrativa
 * real conectada, ver `src/lib/impact/incidentImpactAssessment.ts` docstring)
 * — nunca se colapsan a un único estado global optimista.
 */

/**
 * OBSERVED: dato leído directamente de una fuente (p.ej. el propio ArgusEvent).
 * CALCULATED: resultado determinista de una operación geométrica/aritmética
 *   documentada sobre datos reales (p.ej. punto-en-polígono contra CriticalPoi real).
 * ESTIMATED: aproximación estadística con metodología declarada y explícitamente
 *   marcada como no oficial.
 * SIMULATED: salida de un motor de simulación (FÉNIX) — nunca presentada como observación.
 * NOT_AVAILABLE: preferible a inventar un valor — se declara la razón.
 * UNVERIFIED: dato presente pero sin corroboración suficiente para actuar sobre él solo.
 */
export type ImpactDataState =
  | "OBSERVED"
  | "CALCULATED"
  | "ESTIMATED"
  | "SIMULATED"
  | "NOT_AVAILABLE"
  | "UNVERIFIED";

/**
 * Relación espacial entre un activo y la geometría del incidente. `INSIDE`/
 * `BORDER` solo se emiten cuando el incidente tiene geometría real de área
 * (`polygon`/`administrative_area`) — nunca a partir de un bbox ni de un
 * radio de búsqueda operacional. Con geometría de punto, todo activo
 * encontrado es como máximo `NEAR` (nunca `INSIDE`/`BORDER`, que implicarían
 * una precisión de área que no existe).
 */
export type ImpactSpatialRelation = "INSIDE" | "BORDER" | "NEAR" | "OUTSIDE" | "NOT_DETERMINED";

export interface ImpactedInfrastructureAsset {
  poiId: string;
  name: string;
  category: CriticalPoiCategory;
  priority: CriticalPriority;
  spatialRelation: ImpactSpatialRelation;
  /** km — distancia al punto representativo cuando no hay polígono real; distancia al borde cuando sí lo hay (0 si INSIDE). */
  distanceKm: number | null;
  /** Nunca "hospital destruido/evacuado" — solo lo que la relación espacial permite afirmar. */
  verificationRecommendation: string;
}

export interface InfrastructureImpactResult {
  dataState: ImpactDataState;
  searchRadiusKm: number;
  searchRadiusRationale: string;
  assets: ImpactedInfrastructureAsset[];
  /** true cuando `assets` proviene de INSIDE/BORDER real (polígono), no solo de NEAR por radio. */
  usedRealAreaGeometry: boolean;
}

export interface PopulationExposureResult {
  dataState: ImpactDataState;
  /** null cuando dataState es NOT_AVAILABLE — nunca un número inventado. */
  estimatedRangeLow: number | null;
  estimatedRangeHigh: number | null;
  methodology: string;
  reason: string;
}

export interface RouteImpactResult {
  dataState: ImpactDataState;
  reason: string;
}

export interface ServiceDependencyResult {
  dataState: ImpactDataState;
  reason: string;
}

export type ImpactPriorityLevel = "low" | "medium" | "high" | "critical";

export interface OperationalPriorityResult {
  level: ImpactPriorityLevel;
  /** 0-100, determinista — ver `computeOperationalPriority` para la fórmula documentada. */
  score: number;
  methodology: string;
  /** Componentes que alimentaron `score`, para trazabilidad (Prompt 6 §36). */
  factors: { label: string; value: string }[];
}

export type SuggestedActionStatus = "SUGGESTED" | "PENDING_VALIDATION";

export interface SuggestedImpactAction {
  action: string;
  reason: string;
  priority: ImpactPriorityLevel;
  status: SuggestedActionStatus;
  /** Poi ids that motivated this action, when applicable — for traceability, never shown as an order to act. */
  relatedAssetIds?: string[];
}

export interface IncidentImpactAssessment {
  incidentId: string;
  generatedAt: string;
  assessmentVersion: string;
  /** Leídos del incidente, nunca recalculados por este módulo. */
  incidentSeverity: ArgusSeverity;
  incidentConfidence: ArgusConfidence;
  infrastructure: InfrastructureImpactResult;
  population: PopulationExposureResult;
  routes: RouteImpactResult;
  services: ServiceDependencyResult;
  priority: OperationalPriorityResult;
  suggestedActions: SuggestedImpactAction[];
  /** Explica qué falta y por qué, en lenguaje operador (Prompt 6 §40). */
  limitations: string[];
  isDemo: boolean;
}
