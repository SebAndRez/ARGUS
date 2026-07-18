import { canonicalKnowledgeIncidentToArgusEvent } from "@/lib/canonical/canonicalKnowledgeIncidentToArgusEvent";
import { resolveIncidentSource } from "@/lib/canonical/incidentSourceRegistry";
import { classifyGlobalThreat } from "@/lib/vigia/threatClassifier";
import { buildGlobalDedupKey } from "@/lib/vigia/dedup";
import { confidenceScoreToLevel, type CanonicalConfidenceLevel, type CanonicalVerificationStatus } from "@/types/canonicalIncident";
import type { ArgusIncidentKnowledge } from "@/types/knowledgeIntake";

/**
 * ARGUS — Fase C (`docs/architecture/ARGUS_INCIDENT_MIGRATION_PLAN.md` §3):
 * dual-write de las columnas canónicas nuevas de `KnowledgeIncident`.
 *
 * No reimplementa clasificación de severidad/lifecycle/confianza — reutiliza
 * literalmente lo que Fase A/B ya construyeron (`canonicalKnowledgeIncidentToArgusEvent`,
 * `confidenceScoreToLevel`, `resolveIncidentSource`, `buildGlobalDedupKey`) y
 * solo decide cómo esos resultados ya existentes se persisten como columnas
 * tipadas en vez de derivarse de JSON en cada lectura.
 *
 * Simplificaciones deliberadas de este primer corte (documentadas, no bugs):
 * - `status` persiste el mismo vocabulario de 6 estados ya calculado por
 *   `sweepIncidentLifecycles` (`technicalFactorsJson.lifecycle`) — no el
 *   enum de 11 estados de `CanonicalIncidentLifecycle` (diseño §8.1), que
 *   requeriría una máquina de estados nueva (VALIDATING/ESCALATING/REJECTED/
 *   DUPLICATE) fuera de alcance de esta entrega.
 * - `sourceCount` es `max(previo, sourceIds de este evento)`, no un COUNT
 *   distinto real contra `KnowledgeEvidence` — evita una consulta extra por
 *   evento en el hot path de persistencia (Global Watch corre cada 15 min
 *   contra una base remota). Cota inferior monotónica, nunca decreciente.
 */

const KNOWN_LIFECYCLE_VALUES = new Set(["new", "active", "monitoring", "contained", "resolved", "archived"]);

function readLifecycleField(technicalFactorsJson: unknown): string | null {
  if (!technicalFactorsJson || typeof technicalFactorsJson !== "object") return null;
  const lifecycle = (technicalFactorsJson as Record<string, unknown>).lifecycle;
  return typeof lifecycle === "string" && KNOWN_LIFECYCLE_VALUES.has(lifecycle) ? lifecycle : null;
}

function scopeFor(country: string | null | undefined, region: string | null | undefined): string | null {
  if (!country) return null;
  return region ? "regional" : "national";
}

/**
 * `reviewStatus` nunca sube por sí solo a `OFFICIAL` sin que la fuente sea
 * oficial (diseño §10.2) — una fuente ciudadana/noticia auto-aceptada por
 * confianza alta llega como máximo a `CORROBORATED`.
 */
function verificationStatusFor(reviewStatus: string, isOfficial: boolean): CanonicalVerificationStatus {
  if (reviewStatus === "auto_accepted") return isOfficial ? "OFFICIAL" : "CORROBORATED";
  if (reviewStatus === "needs_more_evidence") return "UNVERIFIED";
  if (reviewStatus === "rejected") return "REJECTED";
  return "CANDIDATE";
}

export type CanonicalFieldsSnapshot = {
  status: string | null;
  effectiveSeverity: string | null;
  confidenceLevel: CanonicalConfidenceLevel | null;
  verificationStatus: CanonicalVerificationStatus | null;
  scope: string | null;
  isOfficial: boolean | null;
  canonicalKey: string | null;
  startedAt: Date | null;
  confirmedAt: Date | null;
  resolvedAt: Date | null;
  archivedAt: Date | null;
  sourceCount: number;
  evidenceCount: number;
};

export type ExistingCanonicalSnapshot = {
  confirmedAt: Date | null;
  resolvedAt: Date | null;
  archivedAt: Date | null;
  sourceCount: number | null;
};

/**
 * Fila mínima requerida para computar los campos canónicos — cualquier
 * fila Prisma de `KnowledgeIncident` (o el `ArgusIncidentKnowledge` de
 * entrada, con `technicalFactors` en vez de `technicalFactorsJson`) la
 * satisface estructuralmente.
 */
export type CanonicalFieldsSourceRow = {
  sourceId: string;
  domain: string;
  subtype: string | null;
  severity: string;
  confidenceScore: number;
  country: string | null;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
  occurredAt: Date | string | null;
  detectedAt: Date | string | null;
  technicalFactorsJson: unknown;
  reviewStatus: string;
};

function toIsoOrUndefined(value: Date | string | null): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

export function computeCanonicalFields(
  row: CanonicalFieldsSourceRow,
  incident: Pick<ArgusIncidentKnowledge, "sourceIds" | "evidenceCount">,
  existing: ExistingCanonicalSnapshot | null,
  now: Date = new Date()
): CanonicalFieldsSnapshot {
  const lifecycleField = readLifecycleField(row.technicalFactorsJson);
  const isOfficial = resolveIncidentSource(row.sourceId).isOfficial;
  const confidenceLevel = confidenceScoreToLevel(row.confidenceScore);
  const verificationStatus = verificationStatusFor(row.reviewStatus, isOfficial);

  // Reutiliza el mismo proyector que ya alimenta el mapa/notificaciones —
  // puede devolver null si la geometría no es resolvible (fila sin
  // lat/lng ni administrative_area válida); en ese caso `effectiveSeverity`
  // queda null en vez de inventar un valor.
  const projected = canonicalKnowledgeIncidentToArgusEvent({
    id: "canonical-fields-sync",
    externalId: null,
    sourceId: row.sourceId,
    sourceName: row.sourceId,
    domain: row.domain,
    subtype: row.subtype,
    title: "",
    summary: "",
    severity: row.severity,
    confidenceScore: row.confidenceScore,
    country: row.country,
    region: row.region,
    locality: null,
    latitude: row.latitude,
    longitude: row.longitude,
    geometryJson: null,
    technicalFactorsJson: row.technicalFactorsJson,
    impactJson: null,
    casualtiesJson: null,
    recommendedActionsJson: null,
    rawEvidenceRefsJson: null,
    tagsJson: null,
    occurredAt: row.occurredAt,
    detectedAt: row.detectedAt,
    createdAt: row.occurredAt ?? row.detectedAt ?? now,
    updatedAt: now,
  });

  const threat = classifyGlobalThreat({ domain: row.domain, subtype: row.subtype });
  const canonicalKey = buildGlobalDedupKey({
    threat,
    country: row.country,
    region: row.region,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    occurredAt: toIsoOrUndefined(row.occurredAt),
  });

  const startedAt =
    (row.occurredAt instanceof Date ? row.occurredAt : row.occurredAt ? new Date(row.occurredAt) : null) ??
    (row.detectedAt instanceof Date ? row.detectedAt : row.detectedAt ? new Date(row.detectedAt) : null);

  const isConfirmedNow = verificationStatus === "CORROBORATED" || verificationStatus === "OFFICIAL";
  const confirmedAt = isConfirmedNow ? (existing?.confirmedAt ?? now) : (existing?.confirmedAt ?? null);

  const resolvedAt = lifecycleField === "resolved" ? (existing?.resolvedAt ?? now) : null;
  const archivedAt = lifecycleField === "archived" ? (existing?.archivedAt ?? now) : null;

  return {
    status: lifecycleField,
    effectiveSeverity: projected?.severity ?? null,
    confidenceLevel,
    verificationStatus,
    scope: scopeFor(row.country, row.region),
    isOfficial,
    canonicalKey,
    startedAt,
    confirmedAt,
    resolvedAt,
    archivedAt,
    sourceCount: Math.max(existing?.sourceCount ?? 0, incident.sourceIds.length),
    evidenceCount: incident.evidenceCount,
  };
}
