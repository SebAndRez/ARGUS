import type { ImpactedInfrastructureAsset, ImpactDataState } from "@/types/incidentImpactAssessment";
import type { FenixShelter } from "@/types/fenix";

/**
 * ARGUS — expediente territorial y relaciones de crisis (Prompt 7).
 *
 * Deliberadamente NO un segundo modelo de incidente, territorio o relación
 * genérica: una proyección compuesta, de solo lectura, que consume — nunca
 * recalcula — el incidente canónico (`ModuleIncidentSummary`, Prompt 17), el
 * análisis de impacto (`IncidentImpactAssessment`, Prompt 6) y la consulta de
 * refugios reales ya conectada (`getRealFenixShelters`, Prompt 6/17). Ver
 * `docs/architecture/ARGUS_TERRITORIAL_DOSSIER_IMPLEMENTATION.md` §1-2 para
 * la auditoría que confirmó, antes de escribir este contrato, que no existe
 * ninguna entidad "Territorio" ni ningún directorio real de
 * organizaciones/autoridades en el repo — por eso esas secciones se declaran
 * `NOT_AVAILABLE` en vez de inventarse.
 */

/** Estado de una sección individual del expediente (Prompt 7 §41) — distinto del `ImpactDataState` de cada dato, que sigue viajando dentro de cada sección quien lo tiene. */
export type DossierSectionStatus = "AVAILABLE" | "PARTIAL" | "STALE" | "UNAVAILABLE" | "NOT_APPLICABLE";

/** Estado agregado del expediente completo (Prompt 7 §14) — nunca se declara `COMPLETE` solo porque una sección lo esté. */
export type DossierOverallStatus = "COMPLETE" | "PARTIAL" | "STALE" | "FAILED";

export interface DossierSection<T> {
  status: DossierSectionStatus;
  data: T;
  /** Explica qué falta y por qué cuando status !== "AVAILABLE" — nunca un `false`/`[]` silencioso. */
  reason?: string;
}

export type TerritorialResolutionMethod =
  | "administrative_geometry"
  | "canonical_fields"
  | "point_only"
  | "not_resolved";

/**
 * Identidad territorial de un incidente. Deliberadamente NO reclama un nivel
 * administrativo preciso (región/provincia/comuna) que este pase no puede
 * verificar de forma confiable a partir de `ModuleIncidentLocation` (que solo
 * expone `countryCode`/`regionCode`, un string plano sin nivel declarado) —
 * en su lugar expone `intersectedAdministrativeAreas`, los nombres reales que
 * la propia geometría del incidente ya resolvió (Prompt 3/5,
 * `argusGeometryResolver.ts`), y dos campos canónicos (`countryCode`,
 * `regionCode`) leídos tal cual del incidente. Ver §12 del mandato: "no
 * inventes precisión cuando la geometría sea insuficiente".
 */
export interface TerritorialIdentity {
  countryCode: string | null;
  regionCode: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Nombres de área administrativa real que la geometría del incidente cubre (puede ser más de una — Prompt 7 §12: "un polígono puede afectar más de una comuna"). Vacío cuando el incidente no tiene geometría de área real. */
  intersectedAdministrativeAreas: string[];
  spansMultipleAdministrativeAreas: boolean;
  resolutionMethod: TerritorialResolutionMethod;
  confidence: "high" | "medium" | "low" | "unresolved";
}

/**
 * Vocabulario de relación acotado al subconjunto que este pase puede derivar
 * de forma real y determinista (Prompt 7 §21) — no el listado completo del
 * mandato, que incluye tipos (`DEPENDS_ON`, `ASSIGNED_TO`, `RESPONSIBLE_FOR`)
 * sin ninguna fuente real conectada todavía (ver deuda técnica).
 */
export type CrisisRelationType = "LOCATED_IN" | "AFFECTS" | "CORRELATED_WITH";

/**
 * OBSERVED: la relación viene declarada directamente por una fuente (no
 *   emitido por este módulo en este pase — no hay ninguna fuente que declare
 *   relaciones explícitas todavía).
 * CALCULATED: resultado determinista de una operación geométrica/de consulta
 *   real (punto-en-polígono, distancia, filtro por territorio) — todas las
 *   relaciones de este pase son CALCULATED.
 * DECLARED: un operador autorizado la registró manualmente (no implementado
 *   en este pase — no se persiste ninguna relación manual, ver deuda técnica).
 */
export type CrisisRelationStatus = "OBSERVED" | "CALCULATED" | "DECLARED";

export interface CrisisRelationSummary {
  /** Determinístico — misma relación siempre produce el mismo id, para deduplicar entre renders. */
  id: string;
  sourceEntityType: string;
  sourceEntityId: string;
  relationType: CrisisRelationType;
  targetEntityType: string;
  targetEntityId: string;
  targetLabel: string;
  status: CrisisRelationStatus;
  /**
   * 0-100, SIEMPRE separada de `incidentSeverity`/`incidentConfidence` del
   * incidente origen (Prompt 7 §45: "no propagar automáticamente la
   * confianza del incidente a todas sus relaciones").
   */
  confidence: number;
  methodology: string;
}

export interface RelatedIncidentSummary {
  id: string;
  title: string;
  type: string;
  severity: string;
}

export interface TerritorialDossier {
  incidentId: string;
  generatedAt: string;
  dossierVersion: string;
  territory: TerritorialIdentity;
  /** Otros incidentes activos con el mismo `regionCode` — nunca incluye el incidente origen. */
  relatedIncidents: DossierSection<RelatedIncidentSummary[]>;
  /** Consumido directamente de `IncidentImpactAssessment.infrastructure` — nunca recalculado (Prompt 7 §26). */
  infrastructure: DossierSection<ImpactedInfrastructureAsset[]>;
  shelters: DossierSection<FenixShelter[]>;
  /** Passthrough del `ImpactDataState` de población del análisis de impacto — mismo `NOT_AVAILABLE`, misma razón, nunca reinventado aquí. */
  population: DossierSection<null>;
  organizations: DossierSection<never[]>;
  historicalRisks: DossierSection<never[]>;
  relationships: CrisisRelationSummary[];
  overallStatus: DossierOverallStatus;
  limitations: string[];
  isDemo: boolean;
}

/** Reexportado para que los consumidores no necesiten importar de `incidentImpactAssessment` solo para este tipo. */
export type { ImpactDataState };
