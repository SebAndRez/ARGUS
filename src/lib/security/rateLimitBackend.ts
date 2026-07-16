import { isProductionEnvironment } from "@/lib/security/productionGuard";

/**
 * ARGUS — backend de almacenamiento del rate limiter (Prompt 12 §6-§7).
 *
 * - `distributed`: Upstash Redis REST (`@upstash/redis`) — único backend
 *   autorizado como protección real de producción, compatible con múltiples
 *   instancias serverless (Vercel) porque el contador vive fuera del proceso.
 * - `memory-development`: contador en memoria del proceso — válido solo
 *   para desarrollo local, tests y preview controlado. Nunca se declara
 *   protección global: cada instancia serverless tendría su propio contador
 *   independiente, lo que en producción equivale a no tener límite real.
 * - `unavailable`: se requeriría un backend distribuido (producción, sin
 *   credenciales Upstash configuradas, o la llamada a Redis falló) y no hay
 *   ninguno disponible. El helper central decide qué hacer con esto según
 *   el `failureMode` de la política (fail_closed vs fail_open_local).
 */
export type RateLimitBackendKind = "distributed" | "memory-development" | "unavailable";

export interface RateLimitCounterResult {
  count: number;
  /** Segundos restantes de la ventana actual, siempre >= 0. */
  ttlSeconds: number;
}

/**
 * Determina qué backend usar SIN hacer ninguna llamada de red — pura,
 * basada solo en variables de entorno. Nunca se expone en respuestas
 * públicas (Prompt 12 §7); solo para decisiones internas y logs controlados.
 */
export function determineRateLimitBackendKind(): RateLimitBackendKind {
  const hasUpstashConfig = Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
  if (hasUpstashConfig) return "distributed";
  return isProductionEnvironment() ? "unavailable" : "memory-development";
}

// ---------------------------------------------------------------------------
// Backend distribuido (Upstash Redis REST)
// ---------------------------------------------------------------------------

/**
 * Shared shape covering both the rate-limit counter operations (Prompt 12)
 * and the job-lock primitives (Prompt 13, `src/lib/jobs/jobLockBackend.ts`)
 * — one client, one cached connection, one test seam, so job locks never
 * introduce a second Redis provider/config (Prompt 13 §5).
 */
export type UpstashRedisClient = {
  pipeline(): {
    incr(key: string): unknown;
    ttl(key: string): unknown;
    exec(): Promise<unknown[]>;
  };
  expire(key: string, seconds: number): Promise<unknown>;
  set(key: string, value: string, opts: { nx: true; px: number }): Promise<"OK" | null>;
  eval(script: string, keys: string[], args: (string | number)[]): Promise<unknown>;
};

let cachedClient: UpstashRedisClient | null = null;
let cachedClientFactory: (() => Promise<UpstashRedisClient>) | null = null;

/**
 * The `@upstash/redis` import is dynamic and lazily cached so this module
 * never touches the network (or even resolves the client) unless a
 * distributed increment is actually attempted — importing this file (e.g.
 * from a test importing `rateLimit.ts`) never causes a real client to be
 * constructed. Tests replace `__setUpstashClientFactoryForTests` instead of
 * hitting a real Upstash project.
 */
export async function getUpstashClient(): Promise<UpstashRedisClient> {
  if (cachedClient) return cachedClient;
  if (cachedClientFactory) {
    cachedClient = await cachedClientFactory();
    return cachedClient;
  }
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error("Upstash Redis REST credentials are not configured.");
  }
  const { Redis } = await import("@upstash/redis");
  cachedClient = new Redis({ url, token }) as unknown as UpstashRedisClient;
  return cachedClient;
}

/** Test-only seam — never used by production code paths. */
export function __setUpstashClientFactoryForTests(factory: (() => Promise<UpstashRedisClient>) | null): void {
  cachedClientFactory = factory;
  cachedClient = null;
}

/**
 * Fixed-window counter over Redis: `INCR` then, only on the first hit of the
 * window (`ttl < 0`, i.e. no expiry set yet), `EXPIRE` to the window length.
 * Both commands are pipelined into a single round trip. Throws on any
 * transport/credential failure — the caller (`rateLimit.ts`) is responsible
 * for turning that into a `backend_error` outcome, never for retrying
 * silently or falling back to memory in production.
 */
export async function incrementDistributedCounter(
  key: string,
  windowSeconds: number
): Promise<RateLimitCounterResult> {
  const redis = await getUpstashClient();
  const pipeline = redis.pipeline();
  pipeline.incr(key);
  pipeline.ttl(key);
  const [count, ttl] = (await pipeline.exec()) as [number, number];

  if (typeof count !== "number" || !Number.isFinite(count)) {
    throw new Error("Unexpected Upstash response shape for INCR.");
  }

  if (typeof ttl !== "number" || ttl < 0) {
    await redis.expire(key, windowSeconds);
    return { count, ttlSeconds: windowSeconds };
  }

  return { count, ttlSeconds: ttl };
}

// ---------------------------------------------------------------------------
// Backend de memoria (desarrollo / tests únicamente)
// ---------------------------------------------------------------------------

interface MemoryEntry {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, MemoryEntry>();

/**
 * Fixed-window counter kept entirely in process memory. `now` is injected
 * (never reads `Date.now()` implicitly from a hidden default in tests) so
 * window-boundary behavior is deterministic and testable.
 */
export function incrementMemoryCounter(
  key: string,
  windowSeconds: number,
  now: number
): RateLimitCounterResult {
  const existing = memoryStore.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowSeconds * 1000;
    memoryStore.set(key, { count: 1, resetAt });
    return { count: 1, ttlSeconds: windowSeconds };
  }
  existing.count += 1;
  return { count: existing.count, ttlSeconds: Math.max(0, Math.ceil((existing.resetAt - now) / 1000)) };
}

/** Test-only reset — production code never calls this. */
export function resetMemoryRateLimitBackendForTests(): void {
  memoryStore.clear();
}
