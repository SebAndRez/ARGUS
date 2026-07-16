import {
  acquireDistributedLock,
  acquireMemoryLock,
  releaseDistributedLock,
  releaseMemoryLock,
} from "@/lib/jobs/jobLockBackend";
import { determineRateLimitBackendKind, type RateLimitBackendKind } from "@/lib/security/rateLimitBackend";
import type { SourceErrorCode } from "@/lib/vigia/sourceOperationsRegistry";

/**
 * ARGUS Prompt 16 — primitivas de scheduler por fuente: vencimiento
 * (`shouldRunSource`), backoff tras fallos, lock por fuente (reutilizando
 * las primitivas atómicas de `jobLockBackend.ts`, sin tocar el tipo cerrado
 * `JobLockName` de `jobLock.ts` para no arriesgar los 3 locks de pipeline ya
 * en producción), timeout explícito por adaptador, y clasificación de
 * errores normalizada.
 */

// ---------------------------------------------------------------------------
// Vencimiento (Prompt 16 §13)
// ---------------------------------------------------------------------------

export type ShouldRunSourceInput = {
  lastAttemptAt: Date | null;
  lastSuccessAt: Date | null;
  intervalMinutes: number;
  now: Date;
  /** Fallos consecutivos más recientes — activa backoff exponencial sobre el intervalo base. */
  consecutiveFailures?: number;
};

export type ShouldRunSourceVerdict = {
  shouldRun: boolean;
  reason: "never_run" | "due" | "not_due" | "backoff";
  /** Minutos hasta la próxima ejecución elegible (0 si `shouldRun` es true). */
  minutesUntilDue: number;
};

const MAX_BACKOFF_MULTIPLIER = 8;

/**
 * Backoff exponencial con tope (Prompt 16 §14): cada fallo consecutivo
 * duplica el intervalo efectivo hasta un máximo de 8x el intervalo base —
 * nunca reintenta indefinidamente a la cadencia normal tras fallos
 * repetidos, y nunca crece sin límite (evita que una fuente rota quede
 * efectivamente desactivada para siempre).
 */
export function computeBackoffIntervalMinutes(baseIntervalMinutes: number, consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return baseIntervalMinutes;
  const multiplier = Math.min(2 ** consecutiveFailures, MAX_BACKOFF_MULTIPLIER);
  return baseIntervalMinutes * multiplier;
}

/**
 * Determina si una fuente está vencida para una nueva ejecución. Pura y
 * determinista — `now` siempre inyectado, nunca `Date.now()` interno.
 * Diferencia último intento de último éxito (Prompt 16 §13): el intervalo
 * efectivo se mide desde el último *intento* (para no volver a intentar
 * antes de tiempo tras un fallo), pero el backoff se activa por fallos
 * consecutivos, no por la mera ausencia de éxito.
 */
export function shouldRunSource(input: ShouldRunSourceInput): ShouldRunSourceVerdict {
  if (!input.lastAttemptAt) {
    return { shouldRun: true, reason: "never_run", minutesUntilDue: 0 };
  }
  const consecutiveFailures = input.consecutiveFailures ?? 0;
  const effectiveIntervalMinutes = computeBackoffIntervalMinutes(input.intervalMinutes, consecutiveFailures);
  const elapsedMinutes = (input.now.getTime() - input.lastAttemptAt.getTime()) / 60_000;
  if (elapsedMinutes >= effectiveIntervalMinutes) {
    return { shouldRun: true, reason: consecutiveFailures > 0 ? "backoff" : "due", minutesUntilDue: 0 };
  }
  return {
    shouldRun: false,
    reason: consecutiveFailures > 0 ? "backoff" : "not_due",
    minutesUntilDue: Math.ceil(effectiveIntervalMinutes - elapsedMinutes),
  };
}

// ---------------------------------------------------------------------------
// Lock por fuente (Prompt 16 §15)
// ---------------------------------------------------------------------------

const DEFAULT_SOURCE_LOCK_TTL_MS = 5 * 60 * 1000;

export type SourceLockHandle = {
  acquired: true;
  sourceId: string;
  backend: RateLimitBackendKind;
  release: () => Promise<void>;
};

export type SourceLockDenied = {
  acquired: false;
  sourceId: string;
  reason: "already_running" | "backend_unavailable";
  backend: RateLimitBackendKind;
};

export type SourceLockResult = SourceLockHandle | SourceLockDenied;

function sourceLockKey(sourceId: string): string {
  return `argus:source-lock:${sourceId}`;
}

function logSourceLockEvent(
  event: "source_lock_acquired" | "source_lock_contended" | "source_lock_released" | "source_lock_release_failed" | "source_lock_backend_unavailable",
  sourceId: string,
  backend: RateLimitBackendKind
): void {
  console.info(
    `[argus:source-lock] ${event} sourceId=${sourceId} backend=${backend} env=${process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown"}`
  );
}

/**
 * Evita que la misma fuente se ejecute dos veces simultáneamente (cron
 * solapado con un disparo manual, dos instancias serverless, un reintento
 * mientras la corrida original sigue viva) — Prompt 16 §15. Un job global
 * puede seguir ejecutando varias fuentes en paralelo; esta función protege
 * solo la fuente individual identificada por `sourceId`.
 */
export async function acquireSourceLock(
  sourceId: string,
  runId: string,
  ttlMs: number = DEFAULT_SOURCE_LOCK_TTL_MS,
  now: Date = new Date()
): Promise<SourceLockResult> {
  const backend = determineRateLimitBackendKind();
  if (backend === "unavailable") {
    logSourceLockEvent("source_lock_backend_unavailable", sourceId, backend);
    return { acquired: false, sourceId, reason: "backend_unavailable", backend };
  }

  const key = sourceLockKey(sourceId);
  let acquired: boolean;
  if (backend === "distributed") {
    try {
      acquired = await acquireDistributedLock(key, runId, ttlMs);
    } catch {
      logSourceLockEvent("source_lock_backend_unavailable", sourceId, "unavailable");
      return { acquired: false, sourceId, reason: "backend_unavailable", backend: "unavailable" };
    }
  } else {
    acquired = acquireMemoryLock(key, runId, ttlMs, now.getTime());
  }

  if (!acquired) {
    logSourceLockEvent("source_lock_contended", sourceId, backend);
    return { acquired: false, sourceId, reason: "already_running", backend };
  }

  logSourceLockEvent("source_lock_acquired", sourceId, backend);
  let released = false;
  const release = async (): Promise<void> => {
    if (released) return;
    released = true;
    try {
      const ok = backend === "distributed" ? await releaseDistributedLock(key, runId) : releaseMemoryLock(key, runId, Date.now());
      logSourceLockEvent(ok ? "source_lock_released" : "source_lock_release_failed", sourceId, backend);
    } catch {
      logSourceLockEvent("source_lock_release_failed", sourceId, backend);
    }
  };

  return { acquired: true, sourceId, backend, release };
}

// ---------------------------------------------------------------------------
// Timeout explícito por adaptador (Prompt 16 §16)
// ---------------------------------------------------------------------------

export class SourceTimeoutError extends Error {
  constructor(sourceId: string, timeoutMs: number) {
    super(`Source "${sourceId}" exceeded its ${timeoutMs}ms timeout.`);
    this.name = "SourceTimeoutError";
  }
}

/**
 * Guarda externa de tiempo — no reemplaza el `AbortController` interno de
 * cada adaptador (que sigue siendo la primera línea de defensa), pero
 * garantiza que ninguna fuente individual pueda consumir más que su
 * `timeoutMs` declarado en el registro, incluso si el adaptador tuviera un
 * bug en su propio timeout interno. No cancela la promesa subyacente (no
 * hay forma segura y genérica de hacerlo sin acceso al `AbortController` de
 * cada adaptador) — solo dejar de esperarla y reportar fallo, consistente
 * con "no se persiste resultado parcial inválido" (Prompt 16 §16).
 */
export async function runWithTimeout<T>(sourceId: string, timeoutMs: number, fn: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SourceTimeoutError(sourceId, timeoutMs)), timeoutMs);
  });
  try {
    return await Promise.race([fn(), timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

// ---------------------------------------------------------------------------
// Clasificación de errores normalizada (Prompt 16 §26)
// ---------------------------------------------------------------------------

/**
 * Traduce un error crudo (mensaje de proveedor, código HTTP, excepción) a
 * uno de los 10 códigos normalizados — nunca se expone el mensaje crudo
 * como contrato público; el mensaje técnico original solo vive en logs
 * seguros (nunca en la respuesta de Source Health).
 */
export function classifySourceError(error: unknown, context: { httpStatus?: number; missingEnv?: boolean } = {}): SourceErrorCode {
  if (error instanceof SourceTimeoutError) return "TIMEOUT";
  if (context.missingEnv) return "AUTH_MISSING";
  if (context.httpStatus === 401 || context.httpStatus === 403) return "AUTH_INVALID";
  if (context.httpStatus === 429) return "RATE_LIMITED";
  if (typeof context.httpStatus === "number" && context.httpStatus >= 500) return "UPSTREAM_5XX";

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes("abort") || message.includes("timeout") || message.includes("timed out")) return "TIMEOUT";
  if (message.includes("429") || message.includes("rate limit")) return "RATE_LIMITED";
  if (message.includes("401") || message.includes("unauthorized") || message.includes("no autorizado")) return "AUTH_INVALID";
  if (message.includes("403") || message.includes("forbidden")) return "AUTH_INVALID";
  if (message.includes("api_key") || message.includes("api key") || message.includes("missing") && message.includes("key")) return "AUTH_MISSING";
  if (/\b5\d{2}\b/.test(message) || message.includes("no disponible") || message.includes("unavailable")) return "UPSTREAM_5XX";
  if (message.includes("json") || message.includes("parse") || message.includes("unexpected token")) return "PARSING_ERROR";
  if (message.includes("prisma") || message.includes("persist") || message.includes("database")) return "PERSISTENCE_ERROR";
  if (message.includes("lock") || message.includes("already_running")) return "LOCKED";
  if (message.includes("disabled") || message.includes("deshabilitad")) return "DISABLED";
  return "NETWORK_ERROR";
}
