import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  enforceRateLimit,
  rateLimitExceededResponse,
  rateLimitHeaders,
  rateLimitResponseForOutcome,
  rateLimitServiceUnavailableResponse,
} from "../../src/lib/security/rateLimit";
import {
  __setUpstashClientFactoryForTests,
  resetMemoryRateLimitBackendForTests,
} from "../../src/lib/security/rateLimitBackend";
import { hashIdentifier, normalizeIp, resolveClientIp } from "../../src/lib/security/clientIdentity";

/**
 * Prompt 12 §22 — core helper tests. Runs entirely against the in-memory
 * backend (no `UPSTASH_REDIS_REST_URL`/`TOKEN` set, not production) unless a
 * test explicitly injects a fake Upstash client factory or forces
 * production env — never touches a real Redis/Upstash project (tests/setup.ts
 * also blocks global `fetch`).
 */

/**
 * `withEnv` (tests/helpers/withEnv.ts) restores env synchronously right
 * after invoking its callback — correct for synchronous assertions, but it
 * restores BEFORE an async callback's awaited work actually runs if you
 * naively `await withEnvAsync(..., async () => {...})` (the `finally` fires as
 * soon as the callback returns a pending Promise, not once it settles).
 * This local variant awaits the callback before restoring.
 */
async function withEnvAsync<T>(overrides: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) saved[key] = process.env[key];
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function fakeRequest(headers: Record<string, string> = {}, pathname = "/api/test"): {
  headers: { get(name: string): string | null };
  nextUrl: { pathname: string };
} {
  const map = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    headers: { get: (name: string) => map.get(name.toLowerCase()) ?? null },
    nextUrl: { pathname },
  };
}

beforeEach(() => {
  resetMemoryRateLimitBackendForTests();
  __setUpstashClientFactoryForTests(null);
});

afterEach(() => {
  resetMemoryRateLimitBackendForTests();
  __setUpstashClientFactoryForTests(null);
});

describe("Caso 1 — solicitud bajo el limite", () => {
  it("permite la operacion y calcula remaining correctamente", async () => {
    const now = new Date("2026-07-14T10:00:00.000Z");
    const outcome = await enforceRateLimit({
      policy: "critical_pois_sync",
      request: fakeRequest({ "x-forwarded-for": "203.0.113.10" }, "/api/critical-pois/sync"),
      identity: { userId: "operator-1" },
      now,
    });
    expect(outcome.allowed).toBe(true);
    expect(outcome.remaining).toBe(2); // maxRequests 3, 1 consumida
    expect(outcome.limit).toBe(3);
  });
});

describe("Caso 2 — limite excedido", () => {
  it("bloquea al superar el umbral y expone retryAfterSeconds/backend != unavailable", async () => {
    const now = new Date("2026-07-14T10:00:00.000Z");
    const call = () =>
      enforceRateLimit({
        policy: "critical_pois_sync",
        request: fakeRequest({}, "/api/critical-pois/sync"),
        identity: { userId: "operator-2" },
        now,
      });
    await call();
    await call();
    await call();
    const fourth = await call();
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterSeconds).toBeGreaterThan(0);
    expect(fourth.backend).toBe("memory-development");

    const response = rateLimitResponseForOutcome(fourth, now);
    expect(response).not.toBeNull();
    expect(response!.status).toBe(429);
    expect(response!.headers.get("Retry-After")).toBe(String(fourth.retryAfterSeconds));
  });
});

describe("Caso 8 — usuarios autenticados diferentes no comparten cuota", () => {
  it("cada userId tiene su propio contador", async () => {
    const now = new Date("2026-07-14T10:00:00.000Z");
    const a = await enforceRateLimit({
      policy: "vigia_manual_run",
      request: fakeRequest({}, "/api/vigia/run"),
      identity: { userId: "user-a" },
      now,
    });
    const b = await enforceRateLimit({
      policy: "vigia_manual_run",
      request: fakeRequest({}, "/api/vigia/run"),
      identity: { userId: "user-b" },
      now,
    });
    expect(a.remaining).toBe(2);
    expect(b.remaining).toBe(2);
  });
});

describe("Caso 9 — IP invalida", () => {
  it("fallback restringido, no bypass ilimitado: comparten un cupo compartido", async () => {
    const now = new Date("2026-07-14T10:00:00.000Z");
    const invalidIpRequest = () => fakeRequest({ "x-forwarded-for": "not-an-ip" }, "/api/quakesense/signals");
    const results = await Promise.all(
      Array.from({ length: 61 }, () =>
        enforceRateLimit({ policy: "quakesense_signal", request: invalidIpRequest(), now })
      )
    );
    // Requests are sequentialized by awaiting Promise.all over sync memory
    // ops, so all 61 share the same "unresolved-ip" bucket (limit 60/60s).
    expect(results.some((r) => r.allowed === false)).toBe(true);
  });
});

describe("Caso 10 — backend distribuido caido en operacion critica (produccion)", () => {
  it("produccion sin Upstash configurado: 503, operacion no ejecutada", async () => {
    await withEnvAsync(
      { VERCEL_ENV: "production", UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined },
      async () => {
        const now = new Date("2026-07-14T10:00:00.000Z");
        const outcome = await enforceRateLimit({
          policy: "knowledge_import_manual",
          request: fakeRequest({}, "/api/knowledge-intake/import/manual"),
          identity: { userId: "operator-3" },
          now,
        });
        expect(outcome.allowed).toBe(false);
        expect(outcome.backend).toBe("unavailable");

        const response = rateLimitResponseForOutcome(outcome, now);
        expect(response!.status).toBe(503);
      }
    );
  });

  it("un fallo del cliente Upstash configurado tambien produce 503 para fail_closed", async () => {
    await withEnvAsync({ UPSTASH_REDIS_REST_URL: "https://example.upstash.io", UPSTASH_REDIS_REST_TOKEN: "token" }, async () => {
      __setUpstashClientFactoryForTests(async () => {
        throw new Error("simulated network failure");
      });
      const outcome = await enforceRateLimit({
        policy: "critical_pois_sync",
        request: fakeRequest({}, "/api/critical-pois/sync"),
        identity: { userId: "operator-4" },
      });
      expect(outcome.allowed).toBe(false);
      expect(outcome.backend).toBe("unavailable");
    });
  });
});

describe("Caso 11 — backend caido en desarrollo", () => {
  it("fuera de produccion sin Upstash configurado, usa memoria (documentado, no bloquea)", async () => {
    await withEnvAsync({ VERCEL_ENV: undefined, NODE_ENV: undefined, UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined }, async () => {
      const outcome = await enforceRateLimit({
        policy: "knowledge_import_manual",
        request: fakeRequest({}, "/api/knowledge-intake/import/manual"),
        identity: { userId: "operator-5" },
      });
      expect(outcome.backend).toBe("memory-development");
      expect(outcome.allowed).toBe(true);
    });
  });

  it("politica fail_open_local se degrada a memoria incluso en produccion (nunca bloquea del todo una senal de emergencia)", async () => {
    await withEnvAsync({ VERCEL_ENV: "production", UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined }, async () => {
      const outcome = await enforceRateLimit({
        policy: "mobile_safety_signal",
        request: fakeRequest({ "x-forwarded-for": "198.51.100.5" }, "/api/mobile-safety/quake-event"),
      });
      expect(outcome.backend).toBe("memory-development");
      expect(outcome.allowed).toBe(true);
    });
  });
});

describe("Backend distribuido — camino exitoso (cliente Upstash falso)", () => {
  it("usa el cliente inyectado, nunca uno real, y reporta backend: distributed", async () => {
    await withEnvAsync({ UPSTASH_REDIS_REST_URL: "https://example.upstash.io", UPSTASH_REDIS_REST_TOKEN: "token" }, async () => {
      const store = new Map<string, number>();
      __setUpstashClientFactoryForTests(async () => ({
        pipeline: () => {
          const ops: Array<() => unknown> = [];
          return {
            incr: (key: string) =>
              ops.push(() => {
                const next = (store.get(key) ?? 0) + 1;
                store.set(key, next);
                return next;
              }),
            ttl: () => ops.push(() => 900),
            exec: async () => ops.map((op) => op()),
          };
        },
        expire: async () => "OK",
        set: async () => null,
        eval: async () => 0,
      }));

      const outcome = await enforceRateLimit({
        policy: "critical_pois_sync",
        request: fakeRequest({}, "/api/critical-pois/sync"),
        identity: { userId: "operator-distributed" },
      });
      expect(outcome.backend).toBe("distributed");
      expect(outcome.allowed).toBe(true);
      expect(outcome.remaining).toBe(2);
    });
  });
});

describe("Caso 14 — concurrencia basica", () => {
  it("solicitudes concurrentes en memoria no superan ampliamente el limite", async () => {
    const now = new Date("2026-07-14T10:00:00.000Z");
    const request = fakeRequest({ "x-forwarded-for": "203.0.113.99" }, "/api/critical-pois/sync");
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        enforceRateLimit({ policy: "critical_pois_sync", request, identity: { userId: "operator-concurrent" }, now })
      )
    );
    const allowedCount = results.filter((r) => r.allowed).length;
    // limit is 3 — Node's single-threaded event loop plus synchronous Map
    // access in the memory backend means this is exact, not approximate.
    expect(allowedCount).toBe(3);
  });
});

describe("Caso 12 — headers coherentes", () => {
  it("valores no negativos, reset valido, Retry-After ausente cuando allowed", async () => {
    const now = new Date("2026-07-14T10:00:00.000Z");
    const outcome = await enforceRateLimit({
      policy: "auth_register_ip",
      request: fakeRequest({ "x-forwarded-for": "203.0.113.20" }, "/api/auth/register"),
      now,
    });
    const headers = rateLimitHeaders(outcome, now);
    expect(Number(headers["RateLimit-Limit"])).toBeGreaterThanOrEqual(0);
    expect(Number(headers["RateLimit-Remaining"])).toBeGreaterThanOrEqual(0);
    expect(Number(headers["RateLimit-Reset"])).toBeGreaterThanOrEqual(0);
    expect(headers["Retry-After"]).toBeUndefined();
  });

  it("cuando bloqueado, Retry-After esta presente y no es negativo", async () => {
    const now = new Date("2026-07-14T10:00:00.000Z");
    const request = fakeRequest({ "x-forwarded-for": "203.0.113.21" }, "/api/auth/login");
    for (let i = 0; i < 10; i += 1) {
      await enforceRateLimit({ policy: "auth_login_ip", request, now });
    }
    const blocked = await enforceRateLimit({ policy: "auth_login_ip", request, now });
    expect(blocked.allowed).toBe(false);
    const headers = rateLimitHeaders(blocked, now);
    expect(Number(headers["Retry-After"])).toBeGreaterThan(0);
  });
});

describe("Caso 13 — ventana se restablece", () => {
  it("con reloj fijo avanzado mas alla de la ventana, la cuota se restablece", async () => {
    const start = new Date("2026-07-14T10:00:00.000Z");
    const request = fakeRequest({ "x-forwarded-for": "203.0.113.30" }, "/api/auth/register");
    for (let i = 0; i < 5; i += 1) {
      await enforceRateLimit({ policy: "auth_register_ip", request, now: start });
    }
    const stillBlocked = await enforceRateLimit({ policy: "auth_register_ip", request, now: start });
    expect(stillBlocked.allowed).toBe(false);

    const afterWindow = new Date(start.getTime() + 3600 * 1000 + 1000);
    const resetOutcome = await enforceRateLimit({ policy: "auth_register_ip", request, now: afterWindow });
    expect(resetOutcome.allowed).toBe(true);
    expect(resetOutcome.remaining).toBe(4);
  });
});

describe("Caso 15 — hash de identificadores", () => {
  it("el email no aparece en texto plano en la clave (verificado indirectamente vía hashIdentifier)", () => {
    const hash = hashIdentifier("Operator@Example.com");
    expect(hash).not.toContain("operator");
    expect(hash).not.toContain("@");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("normaliza mayusculas/espacios antes de hashear (mismo resultado)", () => {
    expect(hashIdentifier("  Foo@Bar.com  ")).toBe(hashIdentifier("foo@bar.com"));
  });

  it("dos cuentas distintas producen contadores independientes en auth_login_account", async () => {
    const now = new Date("2026-07-14T10:00:00.000Z");
    const request = fakeRequest({ "x-forwarded-for": "203.0.113.40" }, "/api/auth/login");
    const outcomeA = await enforceRateLimit({
      policy: "auth_login_account",
      request,
      identity: { accountIdentifier: "alice@example.com" },
      now,
    });
    const outcomeB = await enforceRateLimit({
      policy: "auth_login_account",
      request,
      identity: { accountIdentifier: "bob@example.com" },
      now,
    });
    expect(outcomeA.remaining).toBe(4);
    expect(outcomeB.remaining).toBe(4);
  });
});

describe("resolución de IP (clientIdentity)", () => {
  it("usa el primer valor valido de x-forwarded-for", () => {
    const ip = resolveClientIp(fakeRequest({ "x-forwarded-for": "198.51.100.9, 10.0.0.1" }));
    expect(ip).toBe("198.51.100.9");
  });

  it("normalizeIp rechaza basura y IPs demasiado largas", () => {
    expect(normalizeIp("not-an-ip")).toBeNull();
    expect(normalizeIp("a".repeat(200))).toBeNull();
    expect(normalizeIp("  203.0.113.5  ")).toBe("203.0.113.5");
    expect(normalizeIp("2001:db8::1")).toBe("2001:db8::1");
  });

  it("nunca confia en headers no confiables (x-client-ip)", () => {
    const ip = resolveClientIp(fakeRequest({ "x-client-ip": "1.2.3.4" }));
    expect(ip).toBeNull();
  });
});

describe("Servicio no disponible — respuesta 503 no filtra infraestructura", () => {
  it("rateLimitServiceUnavailableResponse no incluye nombre de proveedor/credenciales", async () => {
    const now = new Date();
    const outcome = {
      allowed: false,
      limit: 3,
      remaining: 0,
      resetAt: now,
      retryAfterSeconds: 900,
      backend: "unavailable" as const,
      policy: "critical_pois_sync" as const,
    };
    const response = rateLimitServiceUnavailableResponse(outcome);
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(JSON.stringify(body).toLowerCase()).not.toContain("upstash");
    expect(JSON.stringify(body).toLowerCase()).not.toContain("redis");
  });

  it("rateLimitExceededResponse expone solo el contrato documentado", async () => {
    const now = new Date();
    const outcome = {
      allowed: false,
      limit: 10,
      remaining: 0,
      resetAt: now,
      retryAfterSeconds: 60,
      backend: "memory-development" as const,
      policy: "auth_login_ip" as const,
    };
    const response = rateLimitExceededResponse(outcome, now);
    const body = await response.json();
    expect(body).toEqual({
      error: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests. Try again later.",
      retryAfterSeconds: 60,
    });
  });
});
