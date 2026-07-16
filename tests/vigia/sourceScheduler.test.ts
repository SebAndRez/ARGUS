import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetMemoryJobLocksForTests } from "@/lib/jobs/jobLockBackend";
import {
  acquireSourceLock,
  classifySourceError,
  computeBackoffIntervalMinutes,
  runWithTimeout,
  shouldRunSource,
  SourceTimeoutError,
} from "@/lib/vigia/sourceScheduler";

const NOW = new Date("2026-07-14T12:00:00.000Z");

beforeEach(() => {
  resetMemoryJobLocksForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("shouldRunSource — vencimiento por fuente (Prompt 16 §13)", () => {
  it("Caso 11 — fuente todavía no vencida: no se ejecuta", () => {
    const verdict = shouldRunSource({
      lastAttemptAt: new Date(NOW.getTime() - 5 * 60_000),
      lastSuccessAt: new Date(NOW.getTime() - 5 * 60_000),
      intervalMinutes: 15,
      now: NOW,
    });
    expect(verdict.shouldRun).toBe(false);
    expect(verdict.reason).toBe("not_due");
    expect(verdict.minutesUntilDue).toBeGreaterThan(0);
  });

  it("Caso 12 — fuente vencida: se ejecuta", () => {
    const verdict = shouldRunSource({
      lastAttemptAt: new Date(NOW.getTime() - 20 * 60_000),
      lastSuccessAt: new Date(NOW.getTime() - 20 * 60_000),
      intervalMinutes: 15,
      now: NOW,
    });
    expect(verdict.shouldRun).toBe(true);
    expect(verdict.reason).toBe("due");
  });

  it("nunca ejecutada antes: siempre vencida (never_run)", () => {
    const verdict = shouldRunSource({ lastAttemptAt: null, lastSuccessAt: null, intervalMinutes: 15, now: NOW });
    expect(verdict.shouldRun).toBe(true);
    expect(verdict.reason).toBe("never_run");
  });

  it("backoff: con fallos consecutivos, el intervalo efectivo crece exponencialmente", () => {
    // 15 min base, 2 fallos → 15*2^2=60 min efectivos. A los 20 min de un
    // intento fallido, la fuente NO está vencida bajo backoff (aunque sí lo
    // estaría con el intervalo base de 15 min).
    const verdict = shouldRunSource({
      lastAttemptAt: new Date(NOW.getTime() - 20 * 60_000),
      lastSuccessAt: null,
      intervalMinutes: 15,
      now: NOW,
      consecutiveFailures: 2,
    });
    expect(verdict.shouldRun).toBe(false);
    expect(verdict.reason).toBe("backoff");
  });

  it("backoff nunca crece sin límite (tope de multiplicador)", () => {
    expect(computeBackoffIntervalMinutes(15, 2)).toBe(60);
    expect(computeBackoffIntervalMinutes(15, 10)).toBe(15 * 8); // tope MAX_BACKOFF_MULTIPLIER=8
    expect(computeBackoffIntervalMinutes(15, 100)).toBe(15 * 8);
  });

  it("es determinista y pura: misma entrada, mismo resultado", () => {
    const input = { lastAttemptAt: new Date(NOW.getTime() - 5 * 60_000), lastSuccessAt: null, intervalMinutes: 15, now: NOW, consecutiveFailures: 1 };
    expect(shouldRunSource(input)).toEqual(shouldRunSource(input));
  });
});

describe("acquireSourceLock / release — lock por fuente (Prompt 16 §15, Caso 13)", () => {
  it("Caso 13 — dos ejecuciones simultáneas de la misma fuente: solo una adquiere el lock", async () => {
    const first = await acquireSourceLock("fixture-source", "run-a");
    const second = await acquireSourceLock("fixture-source", "run-b");
    expect(first.acquired).toBe(true);
    expect(second.acquired).toBe(false);
    if (second.acquired === false) expect(second.reason).toBe("already_running");
    if (first.acquired) await first.release();
  });

  it("dos fuentes distintas no comparten lock", async () => {
    const a = await acquireSourceLock("source-a", "run-a");
    const b = await acquireSourceLock("source-b", "run-b");
    expect(a.acquired).toBe(true);
    expect(b.acquired).toBe(true);
    if (a.acquired) await a.release();
    if (b.acquired) await b.release();
  });

  it("liberar y volver a adquirir funciona (no queda bloqueado permanentemente)", async () => {
    const first = await acquireSourceLock("fixture-source-2", "run-a");
    expect(first.acquired).toBe(true);
    if (first.acquired) await first.release();
    const second = await acquireSourceLock("fixture-source-2", "run-b");
    expect(second.acquired).toBe(true);
    if (second.acquired) await second.release();
  });

  it("release es idempotente (llamarlo dos veces no lanza)", async () => {
    const lock = await acquireSourceLock("fixture-source-3", "run-a");
    expect(lock.acquired).toBe(true);
    if (lock.acquired) {
      await lock.release();
      await expect(lock.release()).resolves.toBeUndefined();
    }
  });
});

describe("runWithTimeout — timeout explícito por adaptador (Prompt 16 §16, Caso 8)", () => {
  it("Caso 8 — una fuente que excede su timeout falla, sin bloquear indefinidamente", async () => {
    const slow = () => new Promise((resolve) => setTimeout(resolve, 50));
    await expect(runWithTimeout("slow-source", 5, slow)).rejects.toThrow(SourceTimeoutError);
  });

  it("una fuente rápida completa normalmente dentro del timeout", async () => {
    const fast = async () => "ok";
    await expect(runWithTimeout("fast-source", 1000, fast)).resolves.toBe("ok");
  });

  it("otras fuentes no se ven afectadas por el timeout de una (aislamiento por promesa independiente)", async () => {
    const slow = () => new Promise((resolve) => setTimeout(resolve, 50));
    const fast = async () => "ok";
    const [slowResult, fastResult] = await Promise.allSettled([
      runWithTimeout("slow-source", 5, slow),
      runWithTimeout("fast-source", 1000, fast),
    ]);
    expect(slowResult.status).toBe("rejected");
    expect(fastResult.status).toBe("fulfilled");
  });
});

describe("classifySourceError — códigos normalizados (Prompt 16 §26)", () => {
  it("clasifica timeout", () => {
    expect(classifySourceError(new SourceTimeoutError("x", 1000))).toBe("TIMEOUT");
  });

  it("clasifica credencial faltante vs inválida", () => {
    expect(classifySourceError(new Error("missing"), { missingEnv: true })).toBe("AUTH_MISSING");
    expect(classifySourceError(new Error("unauthorized"), { httpStatus: 401 })).toBe("AUTH_INVALID");
    expect(classifySourceError(new Error("forbidden"), { httpStatus: 403 })).toBe("AUTH_INVALID");
  });

  it("clasifica rate limit y errores 5xx", () => {
    expect(classifySourceError(new Error("too many requests"), { httpStatus: 429 })).toBe("RATE_LIMITED");
    expect(classifySourceError(new Error("server error"), { httpStatus: 503 })).toBe("UPSTREAM_5XX");
  });

  it("clasifica errores de parsing y de persistencia por mensaje", () => {
    expect(classifySourceError(new Error("Unexpected token in JSON"))).toBe("PARSING_ERROR");
    expect(classifySourceError(new Error("Prisma query failed"))).toBe("PERSISTENCE_ERROR");
  });

  it("nunca expone el mensaje crudo como el propio código — siempre un valor de la unión cerrada", () => {
    const code = classifySourceError(new Error("some very specific vendor-only error string"));
    expect([
      "TIMEOUT", "RATE_LIMITED", "AUTH_MISSING", "AUTH_INVALID", "NETWORK_ERROR",
      "PARSING_ERROR", "UPSTREAM_5XX", "PERSISTENCE_ERROR", "LOCKED", "DISABLED",
    ]).toContain(code);
  });
});
