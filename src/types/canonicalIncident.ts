/**
 * ARGUS — vocabulario de dominio puro del incidente canónico (Fase A,
 * puntos 1-2 de `docs/architecture/ARGUS_INCIDENT_MIGRATION_PLAN.md`).
 *
 * Tipos y enums de dominio, sin acoplamiento a Prisma ni a ningún endpoint.
 * No es una segunda entidad persistida ni un segundo modelo canónico: es el
 * vocabulario que `docs/architecture/ARGUS_CANONICAL_INCIDENT_DESIGN.md` §5
 * y §8-§10 ya diseñó, ahora expresado como tipos TS reutilizables por la
 * capa canónica de lectura (Fase B, `src/lib/canonical/canonicalReadLayer.ts`)
 * y por una futura Fase C de persistencia. `KnowledgeIncident` sigue siendo
 * la única fuente de verdad persistida hoy — este módulo no la reemplaza.
 */

import type { ArgusSeverity, ArgusSourceType } from "@/types/argusEvent";

/** Lifecycle canónico de 11 estados — diseño §8.1. */
export type CanonicalIncidentLifecycle =
  | "DETECTED"
  | "VALIDATING"
  | "CONFIRMED"
  | "ACTIVE"
  | "ESCALATING"
  | "MONITORING"
  | "CONTAINED"
  | "RESOLVED"
  | "ARCHIVED"
  | "REJECTED"
  | "DUPLICATE";

/**
 * Severidad canónica: reutiliza literalmente `ArgusSeverity` (5 niveles,
 * `info < low < medium < high < critical`) en vez de introducir una sexta
 * escala — decisión explícita del diseño §9 ("alineada con la ya madura
 * ArgusSeverity"). El nombre `CanonicalSeverityLevel` es un alias de
 * dominio, no un tipo nuevo con valores propios.
 */
export type CanonicalSeverityLevel = ArgusSeverity;

/** Nivel de confianza derivado (diseño §10.1) — 4 niveles, distinto del `ArgusConfidence` de 5 niveles del DTO. */
export type CanonicalConfidenceLevel = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";

/** Estado de verificación (diseño §10.2) — separado de lifecycle y de severidad. */
export type CanonicalVerificationStatus = "UNVERIFIED" | "CANDIDATE" | "CORROBORATED" | "OFFICIAL" | "REJECTED";

/** Tipos de relación entre incidentes (diseño §5.5). */
export type CanonicalIncidentRelationKind =
  | "duplicate_of"
  | "caused_by"
  | "related_to"
  | "escalates"
  | "child_of"
  | "triggered_by"
  | "affects"
  | "supersedes";

/**
 * Deriva `confidenceLevel` (4 niveles) a partir del mismo `confidenceScore`
 * (0-100) que ya produce `evidenceScoring.ts` / `alertPromotionEngine.ts` —
 * no recalcula el score, solo lo clasifica en un bucket. Umbrales
 * consistentes con `mapConfidence()` en
 * `src/lib/canonical/canonicalKnowledgeIncidentToArgusEvent.ts` (que
 * produce el nivel de 5 valores del DTO `ArgusEvent.confidence`), fusionando
 * sus tramos `high`/`medium_high` en un único `HIGH` porque el dominio
 * canónico define solo 4 niveles (diseño §10.1).
 */
export function confidenceScoreToLevel(confidenceScore: number): CanonicalConfidenceLevel {
  if (confidenceScore >= 90) return "VERY_HIGH";
  if (confidenceScore >= 65) return "HIGH";
  if (confidenceScore >= 50) return "MEDIUM";
  return "LOW";
}

/** Organización/sensor/plataforma que aporta información (diseño §5.2). */
export interface CanonicalIncidentSource {
  id: string;
  name: string;
  type: ArgusSourceType;
  isOfficial: boolean;
  reliabilityScore: number;
}

/** Pieza concreta de evidencia (diseño §5.3) — evolución conceptual de `KnowledgeEvidence`. */
export interface CanonicalIncidentEvidence {
  id: string;
  incidentId: string;
  sourceId: string;
  sourceName: string;
  evidenceType: string;
  externalId?: string;
  publishedAt?: string;
  observedAt?: string;
  receivedAt: string;
  severityReported?: string;
  statusReported?: string;
  isPrimary: boolean;
  isOfficial: boolean;
  url?: string;
  excerpt?: string;
}

/** Transición de lifecycle/severidad trazada (diseño §5.8). */
export interface CanonicalIncidentTransition {
  incidentId: string;
  previousLifecycle: CanonicalIncidentLifecycle | null;
  newLifecycle: CanonicalIncidentLifecycle;
  previousSeverity: CanonicalSeverityLevel | null;
  newSeverity: CanonicalSeverityLevel | null;
  reason: string;
  /** `null` = transición automática (sistema), no manual. */
  actorId: string | null;
  createdAt: string;
}

/** Relación no-fusionante entre dos incidentes (diseño §5.5). */
export interface CanonicalIncidentRelation {
  fromIncidentId: string;
  toIncidentId: string;
  kind: CanonicalIncidentRelationKind;
  confidence?: number;
  explanation?: string;
  createdAt: string;
}

/** Evaluación de riesgo vinculada al incidente (diseño §5.6) — evolución conceptual de `RiskAssessment`. */
export interface CanonicalIncidentAssessment {
  incidentId: string;
  riskType: string;
  probabilityBand: string;
  probabilityScore: number;
  confidence: number;
  severity: CanonicalSeverityLevel;
  recommendedAction: string;
}

/**
 * El incidente canónico en sí (diseño §5.1). Hoy es una forma de **lectura**
 * — no hay tabla `Incident` persistida; se construye en memoria a partir de
 * `KnowledgeIncident` (Fase A/B). Cuando exista persistencia real (Fase C),
 * esta interfaz es el contrato que las columnas nuevas deben satisfacer.
 */
export interface CanonicalIncident {
  id: string;
  canonicalKey: string | null;
  type: string;
  subtype: string | null;
  title: string;
  summary: string;
  lifecycle: CanonicalIncidentLifecycle;
  sourceSeverity: string | null;
  normalizedSeverity: CanonicalSeverityLevel | null;
  assessedSeverity: CanonicalSeverityLevel | null;
  effectiveSeverity: CanonicalSeverityLevel;
  confidenceScore: number;
  confidenceLevel: CanonicalConfidenceLevel;
  verificationStatus: CanonicalVerificationStatus;
  countryCode: string | null;
  regionCode: string | null;
  locality: string | null;
  isOfficial: boolean;
  isDemo: boolean;
  sourceCount: number;
  evidenceCount: number;
  detectedAt: string;
  updatedAt: string;
}
