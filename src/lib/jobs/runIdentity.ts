import { randomUUID } from "crypto";

/**
 * ARGUS — identidad de corrida y clave de idempotencia (Prompt 13 §7-§8).
 *
 * `runId` identifica una ejecución de forma estable a través de logs,
 * adquisición de lock, motor y resultado. Cuando el llamador (workflow de
 * GitHub Actions, panel de operador) provee una `Idempotency-Key`/
 * `X-Argus-Run-Id`, esa clave SE CONVIERTE en el `runId` — reintentos HTTP de
 * la misma corrida (mismo `github.run_id`) conservan la misma clave, así que
 * intentan adquirir el lock con el mismo token; una corrida nueva siempre
 * genera/recibe una clave distinta. Nunca se usa este valor como
 * autorización — solo como identidad/correlación.
 */

const MAX_IDEMPOTENCY_KEY_LENGTH = 200;
/** Alfanumérico + separadores comunes en identificadores de CI (`-_.:`). */
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_.:-]+$/;

export function generateRunId(): string {
  return randomUUID();
}

export interface ResolvedIdempotencyKey {
  /** El runId a usar — el valor provisto (si válido) o uno generado internamente. */
  runId: string;
  /** true si el llamador envió un header de idempotencia (válido o no). */
  provided: boolean;
  valid: boolean;
}

/**
 * Lee `Idempotency-Key` (estándar) o, como alias propio de ARGUS,
 * `X-Argus-Run-Id` — el primero que esté presente gana. Valida longitud y
 * charset antes de aceptarlo; nunca se usa un valor sin validar como parte
 * de una clave de Redis. Cuando falta o es inválido y `provided` es false,
 * se genera un `runId` interno (`crypto.randomUUID()`).
 */
export function resolveIdempotencyKey(headers: { get(name: string): string | null }): ResolvedIdempotencyKey {
  const raw = headers.get("idempotency-key") ?? headers.get("x-argus-run-id");
  if (!raw) {
    return { runId: generateRunId(), provided: false, valid: true };
  }

  const trimmed = raw.trim();
  const valid = trimmed.length > 0 && trimmed.length <= MAX_IDEMPOTENCY_KEY_LENGTH && IDEMPOTENCY_KEY_PATTERN.test(trimmed);
  if (!valid) {
    return { runId: "", provided: true, valid: false };
  }
  return { runId: trimmed, provided: true, valid: true };
}
