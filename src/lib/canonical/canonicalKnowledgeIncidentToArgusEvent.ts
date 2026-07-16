import { canonicalizeGdacsSeverity } from "@/lib/vigia/gdacsSeverity";
import { classifyGlobalThreat, threatToArgusEventType, type GlobalThreatType } from "@/lib/vigia/threatClassifier";
import { getVigiaSource } from "@/lib/vigia/sourceRegistry";
import { isDemoLikeSource } from "@/lib/security/demoDataGuard";
import type { IncidentLifecycle } from "@/lib/vigia/incidentLifecycle";
import type {
  ArgusConfidence,
  ArgusEvent,
  ArgusEventStatus,
  ArgusGeoJsonPolygon,
  ArgusGeometry,
  ArgusGeometryPrecision,
  ArgusSeverity,
  ArgusSourceType,
} from "@/types/argusEvent";

/**
 * ARGUS Prompt 9 — single canonical projection `KnowledgeIncident → ArgusEvent`.
 *
 * Replaces the two independent implementations that had already diverged in
 * production (`src/lib/vigia/vigiaIncidentToArgusEvent.ts`,
 * `src/lib/knowledge-intake/map/knowledgeIncidentToArgusEvent.ts` — both now
 * pure delegating wrappers around this module). Decision record, field-by-field
 * comparison and rationale for every unification rule live in
 * `docs/architecture/ARGUS_CANONICAL_PROJECTION_IMPLEMENTATION.md`, which in
 * turn implements the first approved phase of
 * `docs/architecture/ARGUS_INCIDENT_MIGRATION_PLAN.md` (Fase A).
 *
 * This module does not touch Prisma, does not fetch, does not read env vars
 * or the current date, and never mutates its input — it is a pure function
 * of `CanonicalKnowledgeIncidentInput` to `ArgusEvent | null`.
 */

// ---------------------------------------------------------------------------
// Contrato de entrada — deliberadamente NO el tipo Prisma completo, para que
// este módulo no tenga acoplamiento oculto a la capa de persistencia y sea
// testeable con fixtures planos. Una fila Prisma de `KnowledgeIncident`
// satisface esta forma estructuralmente (los campos extra se ignoran).
// ---------------------------------------------------------------------------

export type CanonicalKnowledgeIncidentInput = {
  id: string;
  externalId: string | null;
  sourceId: string;
  sourceName: string;
  domain: string;
  subtype: string | null;
  title: string;
  summary: string;
  severity: string;
  confidenceScore: number;
  country: string | null;
  region: string | null;
  locality: string | null;
  latitude: number | null;
  longitude: number | null;
  geometryJson: unknown;
  technicalFactorsJson: unknown;
  impactJson: unknown;
  casualtiesJson: unknown;
  recommendedActionsJson: unknown;
  rawEvidenceRefsJson: unknown;
  tagsJson: unknown;
  occurredAt: Date | string | null;
  detectedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export type CanonicalProjectionOptions = {
  /**
   * Prefijo para `ArgusEvent.id` (`${idPrefix}-${incident.id}`). Cada
   * endpoint/wrapper legacy pasa su prefijo histórico (`"vigia"`,
   * `"chile-alert"`) para no cambiar IDs públicos ya en uso — ver §14 del
   * Prompt 9 ("no cambie la estructura pública completa de respuesta").
   */
  idPrefix?: string;
};

const DEFAULT_ID_PREFIX = "incident";

// ---------------------------------------------------------------------------
// Helpers de fecha / JSON — deterministas, nunca lanzan sobre entrada
// malformada (Prompt 9 §15).
// ---------------------------------------------------------------------------

function toDate(value: Date | string | null | undefined): Date | undefined {
  if (value == null) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toIso(value: Date | string | null | undefined): string | undefined {
  return toDate(value)?.toISOString();
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asActionTexts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (item && typeof item === "object" ? (item as { text?: unknown }).text : undefined))
    .filter((text): text is string => typeof text === "string" && text.length > 0);
}

// ---------------------------------------------------------------------------
// Severidad — una sola regla para cualquier fuente (Prompt 9 §8).
// `canonicalizeGdacsSeverity` es un no-op determinista para incidentes que no
// son GDACS (lo garantiza su propia guarda `isGdacsSource`), así que se
// invoca incondicionalmente sin ramificar por familia de fuente — es
// exactamente el mismo mecanismo que ya salvó el bug de severidad verde
// GDACS (v1.0.3.2), ahora con un único punto de entrada en vez de dos.
// ---------------------------------------------------------------------------

const KNOWN_ARGUS_SEVERITIES = new Set(["critical", "high", "medium", "low"]);

/**
 * Fallback seguro: un valor de severidad desconocido nunca se vuelve crítico
 * — se degrada a "medium", el mismo default que ambos mapeadores legacy ya
 * usaban. Documentado explícitamente por el requisito de comportamiento
 * fail-safe (Prompt 9 §8, §15).
 */
function normalizeArgusSeverity(severity: string): ArgusSeverity {
  return KNOWN_ARGUS_SEVERITIES.has(severity) ? (severity as ArgusSeverity) : "medium";
}

function resolveEffectiveSeverity(input: CanonicalKnowledgeIncidentInput, tags: string[]): ArgusSeverity {
  const canonicalized = canonicalizeGdacsSeverity({
    sourceId: input.sourceId,
    sourceName: input.sourceName,
    tags,
    title: input.title,
    description: input.summary,
    severity: input.severity,
    technicalFactors: asRecord(input.technicalFactorsJson),
    impact: asRecord(input.impactJson) as { peopleAffected?: number },
    casualties: asRecord(input.casualtiesJson) as { deaths?: number; displaced?: number },
  }).severity;
  return normalizeArgusSeverity(canonicalized);
}

// ---------------------------------------------------------------------------
// Lifecycle / estado — una sola función (Prompt 9 §9). Dos señales posibles:
// el tag `lifecycle:cancelled` (cancelación explícita por texto, la más
// fuerte) y el campo `technicalFactors.lifecycle` (vocabulario compartido
// `IncidentLifecycle`, poblado tanto por el sweep de Global Watch como por
// `chileAlertLifecycle()` — ambos productores ya usan el mismo vocabulario
// new/active/monitoring/contained/resolved/archived). Cuando ninguna señal
// existe, la severidad es el único fallback seguro: nunca "activo" por
// defecto, para no inventar confirmación.
// ---------------------------------------------------------------------------

const LIFECYCLE_FIELD_TO_STATUS: Record<IncidentLifecycle, ArgusEventStatus> = {
  new: "active",
  active: "active",
  monitoring: "monitoring",
  contained: "monitoring",
  resolved: "resolved",
  archived: "archived",
};

const KNOWN_LIFECYCLE_FIELD_VALUES = new Set(Object.keys(LIFECYCLE_FIELD_TO_STATUS));

/** Único fallback cuando no hay ninguna señal explícita de lifecycle. */
function statusFromSeverity(severity: ArgusSeverity): ArgusEventStatus {
  if (severity === "critical") return "active";
  if (severity === "high") return "risk";
  return "monitoring";
}

export function mapCanonicalLifecycleToArgusStatus(input: {
  tags: string[];
  lifecycleField?: string | null;
  severity: ArgusSeverity;
}): ArgusEventStatus {
  // Cancelación explícita por texto: gana siempre, incluso si el campo no se
  // alcanzó a actualizar en la misma escritura — nunca se muestra como
  // activo algo que la fuente marcó como cancelado.
  if (input.tags.includes("lifecycle:cancelled")) return "resolved";

  if (typeof input.lifecycleField === "string" && KNOWN_LIFECYCLE_FIELD_VALUES.has(input.lifecycleField)) {
    return LIFECYCLE_FIELD_TO_STATUS[input.lifecycleField as IncidentLifecycle];
  }

  // Sin señal de lifecycle (p. ej. incidente recién creado antes del primer
  // sweep de Global Watch): la severidad es el único fallback seguro.
  return statusFromSeverity(input.severity);
}

// ---------------------------------------------------------------------------
// Geometría — una sola política (Prompt 9 §10). Nunca fabrica un polígono
// desde un bbox: solo confía en `geometryJson` cuando tiene exactamente la
// forma estructural de `administrative_area` (geojson Polygon/MultiPolygon +
// anchor finito + nombres de región); cualquier otra forma cae al fallback
// de punto, que solo se usa con coordenadas finitas reales.
// ---------------------------------------------------------------------------

const PRECISION_LEVEL_TO_GEOMETRY_PRECISION: Record<string, ArgusGeometryPrecision> = {
  commune: "administrative_commune",
  province: "administrative_province",
  region: "administrative_region",
};

function isFiniteTuple(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === "number" && Number.isFinite(n));
}

function isValidGeoJsonPolygon(value: unknown): value is ArgusGeoJsonPolygon {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { type?: unknown; coordinates?: unknown };
  if (candidate.type !== "Polygon" && candidate.type !== "MultiPolygon") return false;
  return Array.isArray(candidate.coordinates) && candidate.coordinates.length > 0;
}

type AdministrativeAreaGeometry = Extract<ArgusGeometry, { type: "administrative_area" }>;

/**
 * Solo confía en `geometryJson` cuando calza exactamente con la forma
 * `administrative_area` — nunca reinterpreta un objeto de forma distinta
 * (incluido cualquier bbox mal etiquetado) como si fuera un polígono de
 * alerta válido; en ese caso cae al fallback de punto.
 */
function tryReadAdministrativeAreaGeometry(
  geometryJson: unknown
): { geometry: AdministrativeAreaGeometry; geometryPrecision: ArgusGeometryPrecision } | null {
  if (!geometryJson || typeof geometryJson !== "object") return null;
  const candidate = geometryJson as {
    type?: unknown;
    geojson?: unknown;
    regionNames?: unknown;
    anchor?: unknown;
    precisionLevel?: unknown;
  };
  if (candidate.type !== "administrative_area") return null;
  if (!isValidGeoJsonPolygon(candidate.geojson)) return null;
  if (!isFiniteTuple(candidate.anchor)) return null;

  const precisionLevel = typeof candidate.precisionLevel === "string" ? candidate.precisionLevel : "region";

  return {
    geometry: {
      type: "administrative_area",
      geojson: candidate.geojson,
      regionNames: asStringArray(candidate.regionNames),
      anchor: candidate.anchor,
    },
    geometryPrecision: PRECISION_LEVEL_TO_GEOMETRY_PRECISION[precisionLevel] ?? "administrative_region",
  };
}

function resolveCanonicalGeometry(input: {
  geometryJson: unknown;
  latitude: number | null;
  longitude: number | null;
}): { geometry: ArgusGeometry; geometryPrecision: ArgusGeometryPrecision } | null {
  const administrativeArea = tryReadAdministrativeAreaGeometry(input.geometryJson);
  if (administrativeArea) return administrativeArea;

  if (
    typeof input.latitude === "number" &&
    typeof input.longitude === "number" &&
    Number.isFinite(input.latitude) &&
    Number.isFinite(input.longitude)
  ) {
    return {
      geometry: { type: "point", coordinates: [input.latitude, input.longitude] },
      geometryPrecision: "approximate_point",
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Fuentes / confianza / demo (Prompt 9 §11, §12).
// ---------------------------------------------------------------------------

function sourceTypeFor(sourceId: string): ArgusSourceType {
  if (sourceId === "news_evidence") return "news";
  const definition = getVigiaSource(sourceId);
  if (!definition) return "global_feed";
  if (definition.isOfficial) return "official";
  return definition.role === "context" ? "model_context" : "global_feed";
}

function mapConfidence(confidenceScore: number, unconfirmed: boolean): ArgusConfidence {
  if (unconfirmed) return confidenceScore >= 65 ? "medium" : "low";
  if (confidenceScore >= 90) return "verified";
  if (confidenceScore >= 78) return "high";
  if (confidenceScore >= 65) return "medium_high";
  if (confidenceScore >= 50) return "medium";
  return "low";
}

/**
 * Detección pura de contenido demo/placeholder — reutiliza el helper
 * centralizado (`isDemoLikeSource`) en vez de replicar su lógica, y nunca
 * decide `isDemo` únicamente por texto libre (el helper revisa señales
 * estructurales — tags, sourceId, sourceName — antes que texto libre).
 * Deliberadamente NO usa `shouldHideDemoDataInProduction` (que lee
 * `process.env`): este módulo debe seguir siendo una función pura sin
 * estado global (Prompt 9 §7).
 */
function resolveIsDemo(input: CanonicalKnowledgeIncidentInput, tags: string[]): boolean {
  return isDemoLikeSource({
    title: input.title,
    description: input.summary,
    sourceName: input.sourceName,
    sourceId: input.sourceId,
    tags,
    technicalFactors: asRecord(input.technicalFactorsJson),
  });
}

// ---------------------------------------------------------------------------
// Proyección canónica única.
// ---------------------------------------------------------------------------

export function canonicalKnowledgeIncidentToArgusEvent(
  input: CanonicalKnowledgeIncidentInput,
  options: CanonicalProjectionOptions = {}
): ArgusEvent | null {
  const idPrefix = options.idPrefix ?? DEFAULT_ID_PREFIX;
  const tags = asStringArray(input.tagsJson);
  const isDemo = resolveIsDemo(input, tags);
  const unconfirmed = tags.includes("no-confirmado");

  const severity = resolveEffectiveSeverity(input, tags);

  const geometryResolution = resolveCanonicalGeometry({
    geometryJson: input.geometryJson,
    latitude: input.latitude,
    longitude: input.longitude,
  });
  // Estructuralmente imposible de ubicar en el mapa: resultado controlado
  // (null), nunca un evento engañoso sin ubicación real (Prompt 9 §15).
  if (!geometryResolution) return null;

  const technicalFactors = asRecord(input.technicalFactorsJson);
  const lifecycleField = typeof technicalFactors.lifecycle === "string" ? technicalFactors.lifecycle : undefined;
  const status = mapCanonicalLifecycleToArgusStatus({ tags, lifecycleField, severity });

  const threat: GlobalThreatType = classifyGlobalThreat({
    domain: input.domain,
    subtype: input.subtype,
    title: input.title,
    tags,
  });

  let sourceType = sourceTypeFor(input.sourceId);
  // Contenido demo/placeholder nunca se presenta como una autoridad oficial,
  // sin importar qué sourceId traiga — regla estructural, no depende de
  // entorno/producción (Prompt 9 §12).
  if (isDemo && sourceType === "official") sourceType = "model_context";

  const confidence = mapConfidence(input.confidenceScore, unconfirmed);

  const regionFromTechnicalFactors = typeof technicalFactors.region === "string" ? technicalFactors.region : undefined;
  const provinceFromTechnicalFactors = typeof technicalFactors.province === "string" ? technicalFactors.province : undefined;
  const communeFromTechnicalFactors = typeof technicalFactors.commune === "string" ? technicalFactors.commune : undefined;

  const rawEvidenceRefs = asStringArray(input.rawEvidenceRefsJson);
  const recommendedActions = asActionTexts(input.recommendedActionsJson);
  const occurredAtIso = toIso(input.occurredAt);
  const createdAtIso = toIso(input.createdAt);
  const detectedAtIso = toIso(input.detectedAt) ?? occurredAtIso ?? createdAtIso;
  const lastUpdatedIso = toIso(input.updatedAt) ?? createdAtIso ?? new Date(0).toISOString();

  // No duplicar un tag `lifecycle:*` cuando el incidente ya trae uno propio
  // (caso Chile: `lifecycle:cancelled|modified|maintained|declared|active`);
  // el tag sintético de clasificación de amenaza sí se agrega siempre.
  const hasExplicitLifecycleTag = tags.some((tag) => tag.startsWith("lifecycle:"));
  const outputTags = [
    ...tags,
    `vigia:${threat.toLowerCase()}`,
    ...(hasExplicitLifecycleTag ? [] : [`lifecycle:${lifecycleField ?? "unknown"}`]),
  ];

  return {
    id: `${idPrefix}-${input.id}`,
    title: unconfirmed ? `${input.title} (No confirmado)` : input.title,
    country: input.country ?? "—",
    region: input.region ?? regionFromTechnicalFactors,
    province: provinceFromTechnicalFactors,
    commune: communeFromTechnicalFactors ?? input.locality ?? undefined,
    eventType: threatToArgusEventType(threat),
    severity,
    status,
    confidence,
    sourceType,
    sources: [
      {
        sourceId: input.sourceId,
        sourceName: input.sourceName,
        sourceType,
        url: rawEvidenceRefs[0],
        publishedAt: occurredAtIso,
      },
    ],
    geometry: geometryResolution.geometry,
    geometryPrecision: geometryResolution.geometryPrecision,
    validFrom: occurredAtIso,
    detectedAt: detectedAtIso ?? lastUpdatedIso,
    lastUpdated: lastUpdatedIso,
    attribution: input.sourceName,
    needsOfficialConfirmation: unconfirmed,
    operationalSummary: input.summary,
    recommendedActions,
    tags: outputTags,
    isDemo,
  };
}
