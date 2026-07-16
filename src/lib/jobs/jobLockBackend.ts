import { getUpstashClient } from "@/lib/security/rateLimitBackend";

/**
 * ARGUS — primitivas atómicas de lock distribuido (Prompt 13 §5, §11).
 * Reutiliza el mismo cliente Upstash cacheado del rate limiter
 * (`src/lib/security/rateLimitBackend.ts`) — un solo proveedor distribuido
 * para todo el proyecto, no uno nuevo para locks.
 *
 * `SET key token NX PX ttlMs` es la operación atómica de adquisición
 * (Prompt 13 §5 — nunca "GET, si no existe, SET"). Liberación y renovación
 * usan scripts Lua ejecutados server-side vía `EVAL`, que son atómicos por
 * diseño de Redis: comparan el token antes de `DEL`/`PEXPIRE`, así que una
 * ejecución nunca puede liberar o renovar el lock de otra (Prompt 13 §11).
 */

const RELEASE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`;

const RENEW_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("PEXPIRE", KEYS[1], ARGV[2])
else
  return 0
end
`;

export async function acquireDistributedLock(key: string, token: string, ttlMs: number): Promise<boolean> {
  const redis = await getUpstashClient();
  const result = await redis.set(key, token, { nx: true, px: ttlMs });
  return result === "OK";
}

export async function releaseDistributedLock(key: string, token: string): Promise<boolean> {
  const redis = await getUpstashClient();
  const result = await redis.eval(RELEASE_SCRIPT, [key], [token]);
  return result === 1;
}

export async function renewDistributedLock(key: string, token: string, ttlMs: number): Promise<boolean> {
  const redis = await getUpstashClient();
  const result = await redis.eval(RENEW_SCRIPT, [key], [token, ttlMs]);
  return result === 1;
}

// ---------------------------------------------------------------------------
// Backend de memoria — EXCLUSIVAMENTE desarrollo/tests (Prompt 13 §4, §21).
// No distribuido: cada instancia serverless tendría su propio Map, así que
// esto nunca debe confundirse con protección real de producción. Claramente
// aislado en sus propias funciones para que no pueda usarse por accidente
// donde se espera el backend distribuido.
// ---------------------------------------------------------------------------

interface MemoryLockEntry {
  token: string;
  expiresAt: number;
}

const memoryLocks = new Map<string, MemoryLockEntry>();

export function acquireMemoryLock(key: string, token: string, ttlMs: number, now: number): boolean {
  const existing = memoryLocks.get(key);
  if (existing && existing.expiresAt > now) return false;
  memoryLocks.set(key, { token, expiresAt: now + ttlMs });
  return true;
}

export function releaseMemoryLock(key: string, token: string, now: number): boolean {
  const existing = memoryLocks.get(key);
  if (!existing) return false;
  if (existing.expiresAt <= now) {
    // Expired — nothing left that "this" token legitimately owns.
    memoryLocks.delete(key);
    return false;
  }
  if (existing.token !== token) return false;
  memoryLocks.delete(key);
  return true;
}

export function renewMemoryLock(key: string, token: string, ttlMs: number, now: number): boolean {
  const existing = memoryLocks.get(key);
  if (!existing || existing.expiresAt <= now || existing.token !== token) return false;
  existing.expiresAt = now + ttlMs;
  return true;
}

/** Test-only reset — production code never calls this. */
export function resetMemoryJobLocksForTests(): void {
  memoryLocks.clear();
}
