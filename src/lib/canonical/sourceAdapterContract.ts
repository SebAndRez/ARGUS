/**
 * ARGUS — contrato único de adaptador de fuente (Prompt 4 §9,
 * "Consolidación de fuentes, adaptadores y capas de datos").
 *
 * Un solo contrato TS para separar explícitamente FETCH → NORMALIZACIÓN →
 * VALIDACIÓN en cualquier adaptador de fuente, sin forzar una migración
 * masiva de los ~24 adaptadores existentes en `src/lib/knowledge-intake/adapters/`
 * ni de los 5 que ya alimenta `globalWatchEngine.ts` — el mandato es explícito:
 * "no estás obligado a utilizar estos nombres, respeta las convenciones
 * actuales". Este módulo formaliza el contrato y provee una implementación
 * de referencia para USGS (`src/lib/canonical/adapters/usgsSourceAdapter.ts`,
 * Fase D del prompt: "consolida USGS como flujo de referencia vertical").
 *
 * El resultado normalizado reutiliza `ArgusIncidentKnowledge`
 * (`@/types/knowledgeIntake`) — el shape que ya alimenta `KnowledgeIncident`
 * a través del pipeline de persistencia existente y que el mapeador
 * canónico (`canonicalKnowledgeIncidentToArgusEvent`, Prompt 3) ya proyecta.
 * No se inventa un segundo shape "compatible con el modelo canónico": se
 * reutiliza el que ya lo es.
 *
 * Un adaptador que implemente este contrato NO debe (Prompt 4 §9):
 * - escribir directamente en múltiples tablas — solo retorna observaciones,
 *   la persistencia vive fuera del adaptador (`knowledgePersistenceService.ts`);
 * - decidir qué se muestra en el mapa;
 * - enviar notificaciones;
 * - implementar lifecycle completo;
 * - duplicar políticas de severidad o confianza — `normalize()` puede
 *   preservar la severidad/confianza *reportada por la fuente*, pero la
 *   normalización canónica final (GDACS verde, etc.) vive en
 *   `src/lib/canonical/canonicalKnowledgeIncidentToArgusEvent.ts` (Prompt 3);
 * - contener secretos hardcoded;
 * - alterar el payload original sin conservar procedencia (`rawEvidenceRefs`).
 */

import type { ArgusIncidentKnowledge } from "@/types/knowledgeIntake";
import type { SourceErrorCode } from "@/lib/vigia/sourceOperationsRegistry";

export type SourceFetchContext = {
  /** Guarda externa de tiempo — ver `runWithTimeout` en `sourceScheduler.ts`, mismo vocabulario. */
  timeoutMs: number;
};

export type SourceFetchResult<RawPayload = unknown> =
  | { ok: true; payload: RawPayload; fetchedAt: string; httpStatus?: number }
  | { ok: false; fetchedAt: string; errorCode: SourceErrorCode; errorMessage: string; httpStatus?: number };

export type SourceNormalizeContext = {
  sourceId: string;
  fetchedAt: string;
};

export type ValidationResult = {
  valid: boolean;
  /** Vacío cuando `valid: true`. Nunca expone el payload crudo — solo motivos. */
  reasons: string[];
};

/**
 * Contrato único. `RawPayload` es genérico a propósito (cada fuente tiene su
 * propio formato de origen — GeoJSON, XML, CSV...); el resultado normalizado
 * siempre converge en `ArgusIncidentKnowledge[]`.
 */
export interface ArgusSourceAdapter<RawPayload = unknown> {
  sourceId: string;
  fetch(context: SourceFetchContext): Promise<SourceFetchResult<RawPayload>>;
  normalize(payload: RawPayload, context: SourceNormalizeContext): ArgusIncidentKnowledge[];
  validate(observation: ArgusIncidentKnowledge): ValidationResult;
}

/**
 * Validador genérico reutilizable por cualquier adaptador — comprueba lo
 * mínimo que el modelo canónico (Prompt 3) exige para poder proyectar un
 * `ArgusEvent` sin fabricar datos: identidad estable, coordenadas finitas
 * (o geometría estructurada), y al menos una fuente de procedencia. No
 * valida reglas específicas de dominio (esas viven en cada adaptador si son
 * necesarias) — es el piso común, no el techo.
 */
export function validateNormalizedObservation(observation: ArgusIncidentKnowledge): ValidationResult {
  const reasons: string[] = [];

  if (!observation.id || observation.id.trim().length === 0) {
    reasons.push("Falta un id estable.");
  }
  if (!observation.sourceIds || observation.sourceIds.length === 0) {
    reasons.push("Falta procedencia (sourceIds vacío).");
  }
  const hasFiniteCoordinates =
    typeof observation.latitude === "number" &&
    typeof observation.longitude === "number" &&
    Number.isFinite(observation.latitude) &&
    Number.isFinite(observation.longitude);
  const hasStructuredGeometry = observation.geometry != null;
  if (!hasFiniteCoordinates && !hasStructuredGeometry) {
    reasons.push("Sin coordenadas finitas ni geometría estructurada — no proyectable a ArgusEvent.");
  }
  if (!observation.title || observation.title.trim().length === 0) {
    reasons.push("Falta título.");
  }

  return { valid: reasons.length === 0, reasons };
}
