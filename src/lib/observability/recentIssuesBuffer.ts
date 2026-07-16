import type { OperationalLogEntry } from "@/lib/observability/operationalEvents";

/**
 * ARGUS Prompt 19 §46 — implementación honesta de "problemas activos" sin
 * inventar un backend de series temporales. Buffer acotado, **en memoria,
 * por proceso** — no es Redis, no es Prisma, no es historial: se reinicia en
 * cada cold start / nueva instancia serverless. Sirve únicamente para que
 * `GET /api/operations/health` pueda mostrar señales muy recientes (fallos
 * observados por *este* proceso) sin pretender ser almacenamiento
 * histórico configurado. Ver docs/operations/ARGUS_OBSERVABILITY_BASELINE.md
 * §"Telemetría emitida ≠ almacenamiento histórico".
 */

const MAX_BUFFER_SIZE = 200;

let buffer: OperationalLogEntry[] = [];

export function pushRecentIssue(entry: OperationalLogEntry): void {
  buffer.push(entry);
  if (buffer.length > MAX_BUFFER_SIZE) {
    buffer = buffer.slice(buffer.length - MAX_BUFFER_SIZE);
  }
}

/**
 * `sinceMs` es una ventana relativa a `now` (por defecto ahora real). Sin
 * `sinceMs`, devuelve todo el buffer actual.
 */
export function getRecentIssues(sinceMs?: number, now: Date = new Date()): OperationalLogEntry[] {
  if (sinceMs === undefined) return [...buffer];
  const cutoff = now.getTime() - sinceMs;
  return buffer.filter((entry) => new Date(entry.timestamp).getTime() >= cutoff);
}

/** Solo para tests — nunca se llama desde código de producción. */
export function resetRecentIssuesForTests(): void {
  buffer = [];
}
