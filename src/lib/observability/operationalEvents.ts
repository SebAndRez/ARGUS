import { redactForLog } from "@/lib/observability/redact";
import { pushRecentIssue } from "@/lib/observability/recentIssuesBuffer";

/**
 * ARGUS Prompt 19 — punto de entrada central para logging estructurado
 * nuevo. No reemplaza los loggers ya existentes y probados (`logJobEvent`,
 * `logJobLockEvent`, `logRateLimitEvent`, `logSourceLockEvent`,
 * `logUnrecognizedLifecycle`) — esos siguen intactos, con el mismo formato
 * `[argus:tag] evento clave=valor` que ya usan sus tests. Este helper es el
 * estándar para instrumentación NUEVA (notificaciones, gateway canónico,
 * proyección de mapa, panel de operaciones), documentado en
 * docs/operations/ARGUS_TELEMETRY_DICTIONARY.md junto a los eventos legado.
 */

export type OperationalLogLevel = "debug" | "info" | "warn" | "error";

export interface OperationalEventInput {
  event: string;
  level: OperationalLogLevel;
  component: string;
  requestId?: string;
  runId?: string;
  sourceId?: string;
  incidentId?: string;
  moduleId?: string;
  outcome?: string;
  durationMs?: number;
  count?: number;
  errorCode?: string;
  /** Redactado automáticamente vía `redactForLog` antes de salir a consola. */
  detail?: Record<string, unknown>;
}

export interface OperationalLogEntry {
  timestamp: string;
  level: OperationalLogLevel;
  event: string;
  component: string;
  environment: string;
  requestId?: string;
  runId?: string;
  sourceId?: string;
  incidentId?: string;
  moduleId?: string;
  outcome?: string;
  durationMs?: number;
  count?: number;
  errorCode?: string;
  detail?: Record<string, unknown>;
}

function currentEnvironment(): string {
  return process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown";
}

function omitUndefinedFields<T extends Record<string, unknown>>(input: T): T {
  const out = {} as T;
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

const CONSOLE_BY_LEVEL: Record<OperationalLogLevel, (...args: unknown[]) => void> = {
  debug: (...args) => console.debug(...args),
  info: (...args) => console.info(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};

/**
 * Nunca muta `input`. Campos `undefined` se omiten del objeto emitido (no se
 * serializan como `"field":null` ni como `"field":undefined`). `debug` solo
 * se imprime fuera de producción, igual que los otros loggers `NODE_ENV`-
 * gated del repo — el resto de niveles siempre se imprime. Eventos `warn`/
 * `error` además alimentan `recentIssuesBuffer` para que
 * `GET /api/operations/health` pueda reflejarlos.
 */
export function logOperationalEvent(input: OperationalEventInput): OperationalLogEntry {
  const entry = omitUndefinedFields({
    timestamp: new Date().toISOString(),
    level: input.level,
    event: input.event,
    component: input.component,
    environment: currentEnvironment(),
    requestId: input.requestId,
    runId: input.runId,
    sourceId: input.sourceId,
    incidentId: input.incidentId,
    moduleId: input.moduleId,
    outcome: input.outcome,
    durationMs: input.durationMs,
    count: input.count,
    errorCode: input.errorCode,
    detail: input.detail ? (redactForLog(input.detail) as Record<string, unknown>) : undefined,
  }) as OperationalLogEntry;

  if (entry.level !== "debug" || process.env.NODE_ENV !== "production") {
    CONSOLE_BY_LEVEL[entry.level](`[argus:observability] ${JSON.stringify(entry)}`);
  }

  if (entry.level === "warn" || entry.level === "error") {
    pushRecentIssue(entry);
  }

  return entry;
}
