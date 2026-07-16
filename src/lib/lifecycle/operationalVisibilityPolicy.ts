/**
 * ARGUS Prompt 10 — política canónica de vigencia operacional.
 *
 * Punto único de decisión sobre qué debe considerarse "vigente/activo" en
 * las vistas operacionales (mapa, campana, contadores), independientemente
 * de en qué vocabulario de lifecycle esté expresado el dato de origen hoy:
 * `IncidentLifecycle` (`technicalFactorsJson.lifecycle` de `KnowledgeIncident`,
 * 6 valores), `ArgusEventStatus` (salida del mapeador canónico del Prompt 9,
 * 7 valores), `ArgusNotificationStatus` (5 valores), `IncidentStatus` del
 * Command Center sintético (7 valores) — ver el inventario completo en
 * docs/architecture/ARGUS_OPERATIONAL_LIFECYCLE_POLICY.md.
 *
 * Este módulo NO unifica esos vocabularios ni mueve lifecycle desde JSON
 * hacia columnas — esa es una decisión de persistencia futura (Fase C,
 * docs/architecture/ARGUS_INCIDENT_MIGRATION_PLAN.md). Solo estandariza
 * *cómo se lee* cada uno de ellos hoy, en un solo lugar reutilizable.
 */

const TERMINAL_LIFECYCLE_VALUES = new Set([
  "resolved",
  "archived",
  "rejected",
  "duplicate",
  "dismissed",
  "cancelled",
  "closed",
  "expired",
]);

/**
 * Valores no terminales realmente en uso hoy (`IncidentLifecycle`,
 * `ArgusEventStatus`, `ArgusNotificationStatus`, `IncidentStatus` del
 * Command Center) más los del lifecycle canónico de 11 estados aprobado en
 * el Prompt 8 (`DETECTED/VALIDATING/ESCALATING/CONTAINED` — no alcanzables
 * hoy por ningún dato real, incluidos por compatibilidad hacia adelante).
 */
const KNOWN_NON_TERMINAL_LIFECYCLE_VALUES = new Set([
  "detected",
  "validating",
  "confirmed",
  "active",
  "escalating",
  "monitoring",
  "contained",
  "new",
  "observation",
  "risk",
  "updated",
  "verifying",
  "argus_hypothesis",
  "official_confirmed",
]);

export type LifecycleVisibilityReason =
  | "visible"
  | "absent_lifecycle"
  | "terminal_lifecycle"
  | "unrecognized_lifecycle";

export type LifecycleVisibilityVerdict = {
  visible: boolean;
  reason: LifecycleVisibilityReason;
};

/**
 * Clasifica un valor crudo de lifecycle sin decidir todavía sobre
 * expiración. Determinista, pura, no modifica su entrada.
 *
 * - **Ausente/vacío** → visible (`absent_lifecycle`). Decisión explícita del
 *   Prompt 10 §7, opción 1: la falta de dato no se interpreta como estado
 *   terminal — consistente con el fallback ya aprobado en
 *   `canonicalKnowledgeIncidentToArgusEvent` (Prompt 9), que ante lifecycle
 *   ausente cae a un estado derivado de severidad, nunca a uno terminal.
 * - **Reconocido como terminal** → no visible (`terminal_lifecycle`).
 * - **Reconocido como no terminal** → visible (`visible`).
 * - **Presente pero no reconocido en ningún vocabulario conocido** → no
 *   visible (`unrecognized_lifecycle`), comportamiento fail-closed elegido
 *   deliberadamente para este caso (Prompt 10 §7, opción 2) — un valor
 *   corrupto o de un vocabulario no contemplado nunca se interpreta como
 *   activo/confirmado por defecto.
 */
export function classifyLifecycleVisibility(lifecycle: string | null | undefined): LifecycleVisibilityVerdict {
  const normalized = lifecycle?.toLowerCase().trim();
  if (!normalized) return { visible: true, reason: "absent_lifecycle" };
  if (TERMINAL_LIFECYCLE_VALUES.has(normalized)) return { visible: false, reason: "terminal_lifecycle" };
  if (KNOWN_NON_TERMINAL_LIFECYCLE_VALUES.has(normalized)) return { visible: true, reason: "visible" };
  return { visible: false, reason: "unrecognized_lifecycle" };
}

/**
 * `expiresAt` nulo/ausente nunca se interpreta como expiración (Prompt 10
 * §8) — solo una fecha real, parseable y `<= now` cuenta como vencida
 * (igualdad exacta incluida). Una fecha presente pero no parseable se trata
 * igual que ausente: no se asume expiración a partir de un dato corrupto.
 */
export function isExpired(expiresAt: Date | string | null | undefined, now: Date): boolean {
  if (expiresAt == null) return false;
  const date = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() <= now.getTime();
}

export type OperationalVisibilityInput = {
  lifecycle: string | null | undefined;
  expiresAt: Date | string | null | undefined;
  /** Reloj inyectado explícitamente — esta función nunca llama `Date.now()`/`new Date()` internamente. */
  now: Date;
};

/**
 * Política única de vigencia operacional (`isIncidentOperationallyActive`).
 * Determinista, pura: no consulta base de datos, no hace red, no lee
 * cookies, no depende de estado global, no modifica su entrada, y recibe
 * `now` como argumento en vez de leer el reloj internamente.
 */
export function isIncidentOperationallyActive(input: OperationalVisibilityInput): boolean {
  const { visible } = classifyLifecycleVisibility(input.lifecycle);
  if (!visible) return false;
  if (isExpired(input.expiresAt, input.now)) return false;
  return true;
}

/**
 * Registro controlado (Prompt 10 §20) para cuando `classifyLifecycleVisibility`
 * devuelve `unrecognized_lifecycle` — deliberadamente impura (hace
 * `console.warn`), por eso vive separada de las funciones puras de arriba y
 * se invoca solo desde los call sites (endpoints), nunca desde la política
 * misma. No imprime el payload completo ni datos sensibles: solo el id
 * interno, la fuente y el valor de lifecycle no reconocido.
 */
export function logUnrecognizedLifecycle(context: { id: string; source: string; lifecycle: string }): void {
  console.warn(
    `[argus:lifecycle] valor no reconocido "${context.lifecycle}" en ${context.source}:${context.id} — excluido de vistas activas (fail-closed).`
  );
}
