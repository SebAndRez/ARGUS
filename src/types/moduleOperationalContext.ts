import type { ArgusConfidence, ArgusEventStatus, ArgusEventType, ArgusGeometry, ArgusSeverity } from "@/types/argusEvent";

/**
 * ARGUS Prompt 17 — contrato del contexto operacional compartido.
 *
 * Deliberadamente NO reinventa severidad/lifecycle/geometría: reutiliza los
 * tipos ya aprobados de la proyección canónica (`ArgusEvent`,
 * `src/types/argusEvent.ts`, Prompt 8/9) en vez de declarar una segunda
 * escala paralela. `ModuleIncidentSummary` es un subconjunto deliberado de
 * `ArgusEvent` — no copia el modelo Prisma completo (Prompt 17 §7).
 *
 * `verificationStatus` reutiliza el vocabulario ya existente de
 * `src/types/notificationCenter.ts` (`VerificationStatus`, Prompt 11) por ser
 * el más cercano a lo que el mandato pide — pero se DERIVA aquí de forma
 * independiente a partir de campos ya presentes en `ArgusEvent`
 * (`sourceType`, `needsOfficialConfirmation`), no reutilizando la función
 * interna `sourceTypeForKnowledge()` de `notificationCenterEngine.ts` (ese
 * archivo está fuera de alcance de esta tarea — Prompt 17 §37 prohíbe tocar
 * "notificaciones generales"). Ver `docs/modules/ARGUS_CORE_MODULE_INTEGRATION.md`
 * §"Verificación" para la divergencia documentada entre ambas derivaciones.
 */

/** Reutiliza la escala de 5 niveles ya aprobada de `ArgusEvent.severity` — nunca se recalcula por módulo. */
export type CanonicalSeverity = ArgusSeverity;

/** Reutiliza el lifecycle ya aprobado de `ArgusEvent.status` (Prompt 9/10) — nunca se recalcula por módulo. */
export type CanonicalLifecycle = ArgusEventStatus;

/**
 * Nivel de corroboración — vocabulario compartido con
 * `src/types/notificationCenter.ts` (`VerificationStatus`), pero derivado de
 * forma independiente aquí (ver docstring del archivo). `rejected` no es
 * alcanzable desde el gateway (no hay una fuente de "rechazo" para
 * KnowledgeIncident hoy) — se mantiene en la unión por compatibilidad
 * conceptual con el vocabulario de notificaciones, documentado como no
 * emitido actualmente.
 */
export type ModuleVerificationStatus = "unverified" | "candidate" | "corroborated" | "official" | "rejected";

export type ModuleIncidentLocation = {
  latitude: number | null;
  longitude: number | null;
  geometry: ArgusGeometry;
  countryCode: string | null;
  regionCode: string | null;
};

export type ModuleIncidentTiming = {
  startedAt: string | null;
  updatedAt: string;
  expiresAt: string | null;
};

export type ModuleIncidentSourceSummary = {
  primarySource: string | null;
  sourceCount: number;
  isOfficial: boolean;
};

/**
 * Vista mínima y estable de un incidente canónico para consumo modular.
 * Cualquiera de los cuatro módulos (ATLAS/VIGÍA/ORÁCULO/TALOS) que reciba el
 * mismo `id` debe recibir exactamente los mismos valores en cada campo — es
 * la garantía central del Prompt 17 (§39, criterios 7-10).
 */
export type ModuleIncidentSummary = {
  id: string;
  type: ArgusEventType;
  title: string;
  summary: string | null;
  severity: CanonicalSeverity;
  lifecycle: CanonicalLifecycle;
  verificationStatus: ModuleVerificationStatus;
  confidence: ArgusConfidence;
  location: ModuleIncidentLocation;
  timing: ModuleIncidentTiming;
  sourceSummary: ModuleIncidentSourceSummary;
  isDemo: boolean;
};

export type ModuleIncidentFilters = {
  lifecycle?: CanonicalLifecycle[];
  severity?: CanonicalSeverity[];
  verificationStatus?: ModuleVerificationStatus[];
  type?: ArgusEventType[];
  countryCode?: string;
  regionCode?: string;
  dateFrom?: string;
  dateTo?: string;
  source?: string;
  /** Nunca ilimitado — acotado por `MAX_MODULE_INCIDENTS_LIMIT` (Prompt 17 §9). */
  limit?: number;
  cursor?: string | null;
  /** Solo honrado cuando `isDemoDataAllowed()` es verdadero (Prompt 17 §21). */
  includeDemo?: boolean;
};

export type ModuleIncidentPage = {
  summaries: ModuleIncidentSummary[];
  nextCursor: string | null;
};

/**
 * Errores normalizados (Prompt 17 §27) — nunca un stack trace, nunca un 200
 * con array vacío disfrazando un fallo real.
 */
export type ModuleContextErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "DATA_UNAVAILABLE"
  | "UPSTREAM_DEGRADED"
  | "INVALID_INCIDENT_ID"
  | "INCIDENT_NOT_FOUND"
  | "INSUFFICIENT_DATA";

export type ModuleContextError = {
  code: ModuleContextErrorCode;
  message: string;
};

/**
 * Estados de carga distintos de "sin incidentes" (Prompt 17 §20) — un
 * endpoint caído nunca se representa como una lista vacía.
 */
export type ModuleContextLoadState = "loading" | "available" | "empty" | "degraded" | "unauthorized" | "unavailable" | "insufficient_data";

export type ModuleContextResult<T> =
  | { state: "available"; data: T }
  | { state: "empty"; data: T }
  | { state: "degraded"; data: T; error: ModuleContextError }
  | { state: "unauthorized" | "unavailable" | "insufficient_data"; error: ModuleContextError };

/** Los cuatro módulos cubiertos por esta tarea — usado para resolver permisos por módulo consultor. */
export type OperationalContextModuleId = "argus-atlas" | "argus-vigia" | "argus-oraculo" | "argus-talos";
