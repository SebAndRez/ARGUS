/**
 * ARGUS Prompt 19 §6-7, §24 — taxonomía única de salud operacional y
 * cálculo puro/testeable del estado general. No sustituye las taxonomías
 * de grano fino ya existentes (`SourceOperationalStatus`,
 * `ModuleContextLoadState`, etc.) — es el nivel de agregación que faltaba
 * por encima de todas ellas, para responder "¿ARGUS está sano ahora
 * mismo?" en un solo valor.
 */
export type OperationalHealthStatus =
  | "healthy"
  | "degraded"
  | "unavailable"
  | "misconfigured"
  | "disabled"
  | "unknown";

export interface ComponentHealth {
  component: string;
  status: OperationalHealthStatus;
  detail?: string;
  lastObservedAt?: string | null;
}

/**
 * Precedencia (Prompt 19 §24), en orden:
 * 1. componente CRÍTICO `unavailable` → sistema `unavailable`.
 * 2. componente CRÍTICO `misconfigured` → sistema `misconfigured`.
 * 3. cualquier componente (crítico o importante) `degraded`/`unavailable`/
 *    `misconfigured` que no haya disparado 1-2 → sistema `degraded` (un
 *    componente importante caído degrada la plataforma, no la declara
 *    indisponible por completo).
 * 4. algún componente `unknown` sin señal peor → sistema `unknown`.
 * 5. todos los componentes son `healthy` o `disabled` → `healthy`.
 * 6. sin componentes evaluados → `unknown` (nunca `healthy` por defecto).
 */
export function computeOverallHealth(
  critical: ComponentHealth[],
  important: ComponentHealth[] = []
): OperationalHealthStatus {
  const all = [...critical, ...important];
  if (all.length === 0) return "unknown";

  if (critical.some((c) => c.status === "unavailable")) return "unavailable";
  if (critical.some((c) => c.status === "misconfigured")) return "misconfigured";

  const anyDegradedSignal = all.some(
    (c) => c.status === "degraded" || c.status === "unavailable" || c.status === "misconfigured"
  );
  if (anyDegradedSignal) return "degraded";

  if (all.some((c) => c.status === "unknown")) return "unknown";

  if (all.every((c) => c.status === "healthy" || c.status === "disabled")) return "healthy";

  return "unknown";
}

/** Ventana de frescura (Prompt 19 §25) — nunca confundir "sin éxito registrado" con "vencido": ambos son `true` aquí a propósito, el llamador decide la etiqueta. */
export function isStale(lastSuccessAt: Date | null, freshnessWindowMs: number, now: Date): boolean {
  if (!lastSuccessAt) return true;
  return now.getTime() - lastSuccessAt.getTime() > freshnessWindowMs;
}
