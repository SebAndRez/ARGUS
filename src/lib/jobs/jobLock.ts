import { NextResponse } from "next/server";
import {
  determineRateLimitBackendKind,
  type RateLimitBackendKind,
} from "@/lib/security/rateLimitBackend";
import {
  acquireDistributedLock,
  acquireMemoryLock,
  releaseDistributedLock,
  releaseMemoryLock,
  renewDistributedLock,
  renewMemoryLock,
} from "@/lib/jobs/jobLockBackend";

/**
 * ARGUS — helper central de locks de job (Prompt 13 §15). Única
 * implementación de adquisición/renovación/liberación — ningún endpoint
 * reimplementa lógica de Redis/memoria.
 *
 * Reutiliza `determineRateLimitBackendKind()` del Prompt 12 tal cual: mismo
 * criterio distributed/memory-development/unavailable, mismo backend
 * distribuido (Upstash), sin un segundo proveedor.
 */

export type JobLockName = "global-watch" | "chile-alerts" | "senapred-ingestion" | "codigo-azul-shelters";

/**
 * Preview deployments share `CRON_SECRET` with Production in this Vercel
 * project (single project, both environments read the same secret) — this
 * is the only additional layer stopping a Preview URL from executing a
 * real job against the shared database if that secret ever leaks or gets
 * replayed. Checked first, before the secret comparison, in every
 * `/api/jobs/*` route. Production, local dev, and tests are unaffected —
 * `VERCEL_ENV` is only ever `"preview"` on an actual Preview deployment.
 */
export function isPreviewDeployment(): boolean {
  return process.env.VERCEL_ENV === "preview";
}

export interface JobLockRule {
  name: JobLockName;
  /** Prefijo de clave — Prompt 13 §6: una clave independiente por pipeline. */
  key: string;
  ttlMs: number;
  /** Justificación del TTL — ver docs/operations/ARGUS_JOB_CONCURRENCY_BASELINE.md. */
  notes: string;
}

/**
 * TTLs derivados del código real, no copiados sin verificar (Prompt 13 §9):
 * - `global-watch`: `maxDuration = 300` (5 min, límite duro de Vercel) en
 *   `/api/jobs/run-global-watch` y `/api/vigia/run` — 9 min da ~4 min de
 *   margen sobre el peor caso posible y sigue siendo muchísimo menor que el
 *   intervalo de 15 min entre corridas programadas.
 * - `chile-alerts`/`senapred-ingestion`: sin `maxDuration` explícito (usa el
 *   límite por defecto de la plataforma); la duración observada del pipeline
 *   (fetch + clasificar + upsert de un lote pequeño de alertas SENAPRED) es
 *   de segundos, no minutos — 5 min es generoso incluso contando un timeout
 *   de red completo en `fetchChileOfficialAlertsRaw()`.
 */
export const jobLockRules: Record<JobLockName, JobLockRule> = {
  "global-watch": {
    name: "global-watch",
    key: "argus:job-lock:global-watch",
    ttlMs: 9 * 60 * 1000,
    notes: "9 min: maxDuration=300s + margen, muy por debajo del intervalo de cron de 15 min.",
  },
  "chile-alerts": {
    name: "chile-alerts",
    key: "argus:job-lock:chile-alerts",
    ttlMs: 5 * 60 * 1000,
    notes: "5 min: pipeline observado <2 min, sin maxDuration explícito declarado en el endpoint.",
  },
  "senapred-ingestion": {
    name: "senapred-ingestion",
    key: "argus:job-lock:senapred-ingestion",
    ttlMs: 5 * 60 * 1000,
    notes:
      "Lock secundario compartido (Prompt 13 §20 Opción B) — protege únicamente la sección crítica " +
      "promoteChileOfficialAlerts(), llamada tanto por Chile Alerts como por la fuente SENAPRED de Global Watch.",
  },
  "codigo-azul-shelters": {
    name: "codigo-azul-shelters",
    key: "argus:job-lock:codigo-azul-shelters",
    ttlMs: 5 * 60 * 1000,
    notes:
      "5 min: hasta ~9 páginas HTML secuenciales con retraso deliberado entre solicitudes (cortesía hacia " +
      "el WAF del sitio oficial) más geocodificación de respaldo ocasional — más lento que chile-alerts pero " +
      "sin maxDuration explícito declarado, 5 min sigue siendo generoso frente a la duración observada.",
  },
};

/**
 * Global Watch está acotado por `maxDuration=300s`, es decir, la función
 * serverless termina (con éxito, parcial, o forzada por Vercel) mucho antes
 * de que el TTL de 9 min expire — no hay escenario real donde una corrida
 * legítima siga viva cerca del TTL. Por eso NO se agrega un bucle de
 * renovación automática en los endpoints (Prompt 13 §10: "no agregue
 * renovación si las duraciones reales y el TTL hacen que sea innecesaria").
 * `renew()` se expone igual en el handle para que sea testeable y esté
 * disponible si una fase futura introduce un pipeline de mayor duración.
 */
export const RENEWAL_DECISION =
  "No se implementa renovación automática: maxDuration (300s para Global Watch, sin declarar — por tanto menor — " +
  "para Chile Alerts/SENAPRED) es siempre menor que el TTL de cada lock, así que ninguna ejecución legítima puede " +
  "acercarse a expirar su lock. renew() existe en el handle para uso futuro/tests.";

function logJobLockEvent(
  event:
    | "job_lock_acquired"
    | "job_lock_contended"
    | "job_lock_renewed"
    | "job_lock_renew_failed"
    | "job_lock_released"
    | "job_lock_release_failed"
    | "job_lock_backend_unavailable",
  lockName: JobLockName,
  backend: RateLimitBackendKind
): void {
  // Nunca el token del lock, nunca el runId completo, nunca secretos —
  // solo dimensiones seguras (Prompt 13 §22).
  console.info(
    `[argus:job-lock] ${event} lock=${lockName} backend=${backend} env=${
      process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown"
    }`
  );
}

export interface AcquireJobLockInput {
  name: JobLockName;
  /** Identidad de la corrida — se usa como token propietario del lock. */
  runId: string;
  ttlMs?: number;
  /** Reloj inyectable para tests deterministas. */
  now?: Date;
}

export interface JobLockHandle {
  acquired: true;
  name: JobLockName;
  token: string;
  expiresAt: Date;
  backend: RateLimitBackendKind;
  /** Idempotente — llamadas repetidas después de la primera son no-ops. */
  release: () => Promise<void>;
  /** true si la renovación tuvo éxito (el token seguía siendo propietario). */
  renew: () => Promise<boolean>;
}

export interface JobLockDenied {
  acquired: false;
  name: JobLockName;
  reason: "already_running" | "backend_unavailable";
  backend: RateLimitBackendKind;
}

export type JobLockResult = JobLockHandle | JobLockDenied;

/**
 * Adquisición atómica (`SET NX PX` distribuido, o equivalente en memoria
 * fuera de producción). Fail-closed en producción sin backend distribuido
 * (Prompt 13 §21): nunca se otorga un lock "de memoria" en producción,
 * nunca se ejecuta el pipeline protegido sin protección real.
 */
export async function acquireJobLock(input: AcquireJobLockInput): Promise<JobLockResult> {
  const rule = jobLockRules[input.name];
  const ttlMs = input.ttlMs ?? rule.ttlMs;
  const now = input.now ?? new Date();
  const token = input.runId;
  const backendKind = determineRateLimitBackendKind();

  if (backendKind === "unavailable") {
    logJobLockEvent("job_lock_backend_unavailable", input.name, backendKind);
    return { acquired: false, name: input.name, reason: "backend_unavailable", backend: backendKind };
  }

  let acquired: boolean;
  if (backendKind === "distributed") {
    try {
      acquired = await acquireDistributedLock(rule.key, token, ttlMs);
    } catch {
      logJobLockEvent("job_lock_backend_unavailable", input.name, "unavailable");
      return { acquired: false, name: input.name, reason: "backend_unavailable", backend: "unavailable" };
    }
  } else {
    acquired = acquireMemoryLock(rule.key, token, ttlMs, now.getTime());
  }

  if (!acquired) {
    logJobLockEvent("job_lock_contended", input.name, backendKind);
    return { acquired: false, name: input.name, reason: "already_running", backend: backendKind };
  }

  logJobLockEvent("job_lock_acquired", input.name, backendKind);
  const expiresAt = new Date(now.getTime() + ttlMs);
  let released = false;

  const release = async (): Promise<void> => {
    if (released) return;
    released = true;
    try {
      const ok =
        backendKind === "distributed"
          ? await releaseDistributedLock(rule.key, token)
          : releaseMemoryLock(rule.key, token, Date.now());
      logJobLockEvent(ok ? "job_lock_released" : "job_lock_release_failed", input.name, backendKind);
    } catch {
      logJobLockEvent("job_lock_release_failed", input.name, backendKind);
    }
  };

  const renew = async (): Promise<boolean> => {
    if (released) return false;
    let ok: boolean;
    try {
      ok =
        backendKind === "distributed"
          ? await renewDistributedLock(rule.key, token, ttlMs)
          : renewMemoryLock(rule.key, token, ttlMs, Date.now());
    } catch {
      ok = false;
    }
    logJobLockEvent(ok ? "job_lock_renewed" : "job_lock_renew_failed", input.name, backendKind);
    return ok;
  };

  return { acquired: true, name: input.name, token, expiresAt, backend: backendKind, release, renew };
}

// ---------------------------------------------------------------------------
// Respuestas HTTP estándar (Prompt 13 §12) — una sola política: 409 Conflict
// para "ya en ejecución" (más ampliamente soportado/entendido por clientes
// HTTP y por curl que 423 Locked, que es específico de WebDAV), 503 para
// backend no disponible. Ningún endpoint reimplementa esta distinción.
// ---------------------------------------------------------------------------

export function jobAlreadyRunningResponse(pipeline: JobLockName): NextResponse {
  return NextResponse.json(
    { status: "already_running", pipeline, retryable: true },
    { status: 409 }
  );
}

export function jobLockUnavailableResponse(pipeline: JobLockName): NextResponse {
  return NextResponse.json(
    { status: "error", error: "SERVICE_UNAVAILABLE", pipeline, retryable: true },
    { status: 503 }
  );
}

/** `null` significa "lock adquirido, continuar"; de lo contrario, la respuesta HTTP correcta. */
export function responseForJobLockResult(result: JobLockResult): NextResponse | null {
  if (result.acquired) return null;
  return result.reason === "backend_unavailable"
    ? jobLockUnavailableResponse(result.name)
    : jobAlreadyRunningResponse(result.name);
}

// ---------------------------------------------------------------------------
// Observabilidad del job en sí (Prompt 13 §22-§23) — distinta de los eventos
// de lock de arriba.
// ---------------------------------------------------------------------------

export type JobRunStatus = "success" | "partial_success" | "failed" | "already_running";

export function logJobEvent(
  event: "job_started" | "job_completed" | "job_partial" | "job_failed",
  input: { pipeline: JobLockName; durationMs?: number; sourcesConsulted?: number }
): void {
  console.info(
    `[argus:job] ${event} pipeline=${input.pipeline}` +
      (input.durationMs !== undefined ? ` durationMs=${input.durationMs}` : "") +
      (input.sourcesConsulted !== undefined ? ` sourcesConsulted=${input.sourcesConsulted}` : "") +
      ` env=${process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown"}`
  );
}
