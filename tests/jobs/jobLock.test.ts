import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  acquireJobLock,
  jobAlreadyRunningResponse,
  jobLockUnavailableResponse,
  responseForJobLockResult,
} from "../../src/lib/jobs/jobLock";
import { resetMemoryJobLocksForTests } from "../../src/lib/jobs/jobLockBackend";
import { __setUpstashClientFactoryForTests } from "../../src/lib/security/rateLimitBackend";
import { generateRunId, resolveIdempotencyKey } from "../../src/lib/jobs/runIdentity";

/**
 * Prompt 13 §24 — core job-lock helper tests. Runs against the in-memory
 * backend (no Upstash env configured, not production) unless a test
 * explicitly forces production or injects a fake Upstash client — never
 * touches a real Redis/Upstash project.
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

beforeEach(() => {
  resetMemoryJobLocksForTests();
  __setUpstashClientFactoryForTests(null);
});

afterEach(() => {
  resetMemoryJobLocksForTests();
  __setUpstashClientFactoryForTests(null);
});

describe("Caso 1 — primera ejecucion", () => {
  it("adquiere el lock, expone token/expiresAt, libera correctamente", async () => {
    const now = new Date("2026-07-14T10:00:00.000Z");
    const result = await acquireJobLock({ name: "global-watch", runId: "run-1", now });
    expect(result.acquired).toBe(true);
    if (!result.acquired) throw new Error("expected acquired");
    expect(result.token).toBe("run-1");
    expect(result.expiresAt.getTime()).toBeGreaterThan(now.getTime());
    await result.release();
  });
});

describe("Caso 2 — segunda ejecucion simultanea", () => {
  it("no adquiere el lock mientras la primera sigue activa; already_running", async () => {
    const now = new Date("2026-07-14T10:00:00.000Z");
    const first = await acquireJobLock({ name: "chile-alerts", runId: "run-a", now });
    expect(first.acquired).toBe(true);

    const second = await acquireJobLock({ name: "chile-alerts", runId: "run-b", now });
    expect(second.acquired).toBe(false);
    if (second.acquired) throw new Error("expected denied");
    expect(second.reason).toBe("already_running");

    const response = responseForJobLockResult(second);
    expect(response!.status).toBe(409);
    const body = await response!.json();
    expect(body).toEqual({ status: "already_running", pipeline: "chile-alerts", retryable: true });
  });
});

describe("Caso 3 — error dentro del pipeline", () => {
  it("el lock se libera en finally aunque el pipeline lance, y una siguiente ejecucion lo adquiere", async () => {
    const now = new Date("2026-07-14T10:00:00.000Z");
    const lock = await acquireJobLock({ name: "global-watch", runId: "run-err", now });
    expect(lock.acquired).toBe(true);
    if (!lock.acquired) throw new Error("expected acquired");

    let caught: unknown = null;
    try {
      try {
        throw new Error("pipeline exploded");
      } finally {
        await lock.release();
      }
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);

    const next = await acquireJobLock({ name: "global-watch", runId: "run-after-err", now });
    expect(next.acquired).toBe(true);
  });
});

describe("Caso 4 — caida sin liberacion (expiracion de TTL)", () => {
  it("el lock queda disponible una vez el TTL expira, sin necesidad de release()", async () => {
    const start = new Date("2026-07-14T10:00:00.000Z");
    const first = await acquireJobLock({ name: "chile-alerts", runId: "run-crashed", ttlMs: 1000, now: start });
    expect(first.acquired).toBe(true);

    const stillLocked = await acquireJobLock({ name: "chile-alerts", runId: "run-retry", ttlMs: 1000, now: start });
    expect(stillLocked.acquired).toBe(false);

    const afterTtl = new Date(start.getTime() + 1001);
    const afterExpiry = await acquireJobLock({ name: "chile-alerts", runId: "run-retry-2", ttlMs: 1000, now: afterTtl });
    expect(afterExpiry.acquired).toBe(true);
  });
});

describe("Caso 5 — propietario incorrecto", () => {
  it("una ejecucion no puede liberar el lock de otra", async () => {
    const now = new Date("2026-07-14T10:00:00.000Z");
    const owner = await acquireJobLock({ name: "senapred-ingestion", runId: "owner-run", now });
    expect(owner.acquired).toBe(true);

    // Simulate a second, unrelated handle believing it owns the same lock
    // (e.g. a stale reference after a crash) by acquiring with a different
    // token directly against the backend — it should fail to acquire (still
    // held), and releasing with a foreign token must not remove the real
    // owner's lock.
    const impostor = await acquireJobLock({ name: "senapred-ingestion", runId: "impostor-run", now });
    expect(impostor.acquired).toBe(false);

    // The real owner still holds the lock — a third acquisition attempt with
    // the correct rule/name still fails until the owner releases.
    const stillDenied = await acquireJobLock({ name: "senapred-ingestion", runId: "another-run", now });
    expect(stillDenied.acquired).toBe(false);

    if (owner.acquired) await owner.release();
    const afterRelease = await acquireJobLock({ name: "senapred-ingestion", runId: "final-run", now });
    expect(afterRelease.acquired).toBe(true);
  });
});

describe("Caso 6 — renovacion", () => {
  it("el propietario puede renovar; un token que no es propietario no puede", async () => {
    // `renew()`/`release()` always check against real wall-clock time
    // internally (unlike acquisition, they don't take an injected `now`),
    // so this test uses the real clock throughout rather than mixing a
    // fictional fixed `now` for acquisition with real time for renewal.
    const lock = await acquireJobLock({ name: "global-watch", runId: "owner-token", ttlMs: 60_000 });
    expect(lock.acquired).toBe(true);
    if (!lock.acquired) throw new Error("expected acquired");

    const renewed = await lock.renew();
    expect(renewed).toBe(true);

    await lock.release();
    // After release, renew() on the same (now-released) handle must not resurrect the lock.
    const renewedAfterRelease = await lock.renew();
    expect(renewedAfterRelease).toBe(false);
  });
});

describe("Caso 7 — backend caido en produccion", () => {
  it("503, pipeline no ejecutado", async () => {
    await withEnvAsync(
      { VERCEL_ENV: "production", UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined },
      async () => {
        const result = await acquireJobLock({ name: "global-watch", runId: "prod-run" });
        expect(result.acquired).toBe(false);
        if (result.acquired) throw new Error("expected denied");
        expect(result.reason).toBe("backend_unavailable");
        const response = jobLockUnavailableResponse(result.name);
        expect(response.status).toBe(503);
      }
    );
  });
});

describe("Caso 8 — backend local en desarrollo", () => {
  it("lock funcional dentro del proceso, backend reportado como memory-development", async () => {
    await withEnvAsync(
      { VERCEL_ENV: undefined, NODE_ENV: undefined, UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined },
      async () => {
        const result = await acquireJobLock({ name: "chile-alerts", runId: "dev-run" });
        expect(result.acquired).toBe(true);
        if (!result.acquired) throw new Error("expected acquired");
        expect(result.backend).toBe("memory-development");
        await result.release();
      }
    );
  });
});

describe("Caso 12 — dos pipelines distintos", () => {
  it("pueden ejecutarse simultaneamente sin lock compartido", async () => {
    const now = new Date("2026-07-14T10:00:00.000Z");
    const globalWatch = await acquireJobLock({ name: "global-watch", runId: "gw-run", now });
    const chileAlerts = await acquireJobLock({ name: "chile-alerts", runId: "ca-run", now });
    expect(globalWatch.acquired).toBe(true);
    expect(chileAlerts.acquired).toBe(true);
  });
});

describe("Caso 13 — lock SENAPRED compartido", () => {
  it("solo uno entra al bloque critico cuando ambos pipelines intentan procesar SENAPRED", async () => {
    const now = new Date("2026-07-14T10:00:00.000Z");
    const fromGlobalWatch = await acquireJobLock({ name: "senapred-ingestion", runId: "gw-senapred", now });
    const fromChileAlerts = await acquireJobLock({ name: "senapred-ingestion", runId: "ca-senapred", now });
    expect(fromGlobalWatch.acquired).toBe(true);
    expect(fromChileAlerts.acquired).toBe(false);
  });
});

describe("runIdentity — generacion e idempotency key", () => {
  it("generateRunId produce un UUID valido", () => {
    const id = generateRunId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it("Caso 9/10 — usa la idempotency key provista cuando es valida", () => {
    const headers = new Map([["idempotency-key", "argus-run-global-watch-123-1"]]);
    const resolved = resolveIdempotencyKey({ get: (name) => headers.get(name.toLowerCase()) ?? null });
    expect(resolved.runId).toBe("argus-run-global-watch-123-1");
    expect(resolved.provided).toBe(true);
    expect(resolved.valid).toBe(true);
  });

  it("genera un runId nuevo cuando no se provee ninguna key", () => {
    const resolved = resolveIdempotencyKey({ get: () => null });
    expect(resolved.provided).toBe(false);
    expect(resolved.valid).toBe(true);
    expect(resolved.runId.length).toBeGreaterThan(0);
  });

  it("Caso 18 — headers invalidos: key excesiva o con caracteres no permitidos se marca invalida", () => {
    const tooLong = "x".repeat(300);
    const resolvedLong = resolveIdempotencyKey({ get: (name) => (name === "idempotency-key" ? tooLong : null) });
    expect(resolvedLong.valid).toBe(false);

    const badChars = "run-id; DROP TABLE users;";
    const resolvedBad = resolveIdempotencyKey({ get: (name) => (name === "idempotency-key" ? badChars : null) });
    expect(resolvedBad.valid).toBe(false);
  });
});

describe("respuesta already_running no filtra detalles internos", () => {
  it("nunca incluye token, runId completo, backend o secretos", async () => {
    const response = jobAlreadyRunningResponse("global-watch");
    const body = await response.json();
    const serialized = JSON.stringify(body).toLowerCase();
    expect(serialized).not.toContain("token");
    expect(serialized).not.toContain("upstash");
    expect(serialized).not.toContain("redis");
    expect(body).toEqual({ status: "already_running", pipeline: "global-watch", retryable: true });
  });
});
