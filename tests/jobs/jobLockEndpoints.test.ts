import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Prompt 13 §25 — endpoint-level job lock tests. Drives the real route
 * handlers with the real in-memory lock/rate-limit backends (reset between
 * tests) and mocks only the actual I/O boundary (auth, the pipeline engine
 * functions, SENAPRED fetch/promotion). Demonstrates
 * `lock no adquirido → motor no llamado` and `motor falla → release llamado`
 * end to end. Never touches Redis, Supabase, real sources, or GitHub.
 */

vi.mock("@/services/authService", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/vigia/globalWatchEngine", () => ({
  runGlobalWatch: vi.fn(),
}));

vi.mock("@/lib/sources/chile/senapredProvider", () => ({
  fetchChileOfficialAlertsRaw: vi.fn(),
}));

vi.mock("@/lib/incidents/chileAlertPromotionEngine", () => ({
  promoteChileOfficialAlerts: vi.fn(),
}));

import { NextRequest } from "next/server";
import { getCurrentUser } from "@/services/authService";
import { runGlobalWatch } from "@/lib/vigia/globalWatchEngine";
import { fetchChileOfficialAlertsRaw } from "@/lib/sources/chile/senapredProvider";
import { promoteChileOfficialAlerts } from "@/lib/incidents/chileAlertPromotionEngine";
import { POST as vigiaRunPost } from "@/app/api/vigia/run/route";
import { GET as jobsGlobalWatchGet } from "@/app/api/jobs/run-global-watch/route";
import { POST as chileAlertsRunPost } from "@/app/api/chile-alerts/run/route";
import { GET as jobsChileAlertsGet } from "@/app/api/jobs/run-chile-alerts/route";
import { acquireJobLock } from "@/lib/jobs/jobLock";
import { resetMemoryJobLocksForTests } from "@/lib/jobs/jobLockBackend";
import { resetMemoryRateLimitBackendForTests } from "@/lib/security/rateLimitBackend";
import { enforceRateLimit } from "@/lib/security/rateLimit";

const getCurrentUserMock = vi.mocked(getCurrentUser);
const runGlobalWatchMock = vi.mocked(runGlobalWatch);
const fetchChileOfficialAlertsRawMock = vi.mocked(fetchChileOfficialAlertsRaw);
const promoteChileOfficialAlertsMock = vi.mocked(promoteChileOfficialAlerts);

const OPERATOR = { id: "operator-job-lock-test", role: "OPERATOR" };
const CRON_SECRET = "test-cron-secret-value";

function cronRequest(url: string, secret = CRON_SECRET, extraHeaders: Record<string, string> = {}) {
  return new NextRequest(url, {
    method: "GET",
    headers: { authorization: `Bearer ${secret}`, ...extraHeaders },
  });
}

function manualRequest(url: string, headers: Record<string, string> = {}) {
  return new NextRequest(url, { method: "POST", headers });
}

beforeEach(() => {
  resetMemoryJobLocksForTests();
  resetMemoryRateLimitBackendForTests();
  process.env.CRON_SECRET = CRON_SECRET;
  getCurrentUserMock.mockResolvedValue(OPERATOR as never);
  runGlobalWatchMock.mockResolvedValue({
    status: "success",
    seedMode: false,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 10,
    sourcesConsulted: 1,
    incidentsCreated: 0,
    incidentsUpdated: 0,
    evidenceCreated: 0,
    notificationsGenerated: 0,
    candidatesCreated: 0,
    lifecycle: null,
    errorsBySource: {},
    sources: [],
  } as never);
  fetchChileOfficialAlertsRawMock.mockResolvedValue({ alerts: [], warnings: [], errors: [] } as never);
  promoteChileOfficialAlertsMock.mockResolvedValue({
    status: "success",
    runId: "ingestion-run-1",
    inserted: 0,
    updated: 0,
    skipped: 0,
    notPromoted: 0,
    incidents: [],
    errors: [],
  } as never);
});

afterEach(() => {
  vi.clearAllMocks();
  resetMemoryJobLocksForTests();
  resetMemoryRateLimitBackendForTests();
  delete process.env.CRON_SECRET;
});

describe("lock no adquirido -> motor no llamado (Global Watch)", () => {
  it("cron: 409 already_running, runGlobalWatch nunca se llama", async () => {
    const held = await acquireJobLock({ name: "global-watch", runId: "external-holder" });
    expect(held.acquired).toBe(true);

    const response = await jobsGlobalWatchGet(cronRequest("http://localhost/api/jobs/run-global-watch"));
    expect(response.status).toBe(409);
    expect(runGlobalWatchMock).not.toHaveBeenCalled();

    if (held.acquired) await held.release();
  });

  it("manual: 409 already_running, runGlobalWatch nunca se llama", async () => {
    const held = await acquireJobLock({ name: "global-watch", runId: "external-holder" });
    expect(held.acquired).toBe(true);

    const response = await vigiaRunPost(manualRequest("http://localhost/api/vigia/run"));
    expect(response.status).toBe(409);
    expect(runGlobalWatchMock).not.toHaveBeenCalled();

    if (held.acquired) await held.release();
  });
});

describe("Caso 11 — cron y manual comparten el lock global-watch", () => {
  it("solo una de las dos vias ejecuta el pipeline cuando la otra ya lo tiene tomado", async () => {
    const externalHolder = await acquireJobLock({ name: "global-watch", runId: "already-running-elsewhere" });
    expect(externalHolder.acquired).toBe(true);

    const manualResponse = await vigiaRunPost(manualRequest("http://localhost/api/vigia/run"));
    expect(manualResponse.status).toBe(409);

    const cronResponse = await jobsGlobalWatchGet(cronRequest("http://localhost/api/jobs/run-global-watch"));
    expect(cronResponse.status).toBe(409);

    expect(runGlobalWatchMock).not.toHaveBeenCalled();
    if (externalHolder.acquired) await externalHolder.release();

    // Once released, a legitimate request can proceed.
    const afterRelease = await jobsGlobalWatchGet(cronRequest("http://localhost/api/jobs/run-global-watch"));
    expect(afterRelease.status).toBe(200);
    expect(runGlobalWatchMock).toHaveBeenCalledTimes(1);
  });
});

describe("motor falla -> release llamado (Global Watch)", () => {
  it("un error dentro de runGlobalWatch libera el lock igual (finally)", async () => {
    runGlobalWatchMock.mockRejectedValueOnce(new Error("source explosion"));
    const response = await jobsGlobalWatchGet(cronRequest("http://localhost/api/jobs/run-global-watch"));
    expect(response.status).toBe(502);

    // Lock must be free again immediately after.
    const nextAttempt = await acquireJobLock({ name: "global-watch", runId: "post-failure" });
    expect(nextAttempt.acquired).toBe(true);
    if (nextAttempt.acquired) await nextAttempt.release();
  });
});

describe("Caso 15 — resultado parcial mantiene el lock hasta consolidar", () => {
  it("un resultado partial_success se devuelve normalmente y el lock se libera solo al final", async () => {
    runGlobalWatchMock.mockResolvedValueOnce({
      status: "partial",
      seedMode: false,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 20,
      sourcesConsulted: 3,
      incidentsCreated: 1,
      incidentsUpdated: 0,
      evidenceCreated: 1,
      notificationsGenerated: 1,
      candidatesCreated: 0,
      lifecycle: null,
      errorsBySource: { usgs_earthquake: ["timeout"] },
      sources: [],
    } as never);

    const response = await jobsGlobalWatchGet(cronRequest("http://localhost/api/jobs/run-global-watch"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("partial");

    const afterCompletion = await acquireJobLock({ name: "global-watch", runId: "after-partial" });
    expect(afterCompletion.acquired).toBe(true);
    if (afterCompletion.acquired) await afterCompletion.release();
  });
});

describe("Caso 16 — autorizacion", () => {
  it("secreto incorrecto: 401, no adquiere lock, no bloquea al cron legitimo despues", async () => {
    const unauthorized = await jobsGlobalWatchGet(cronRequest("http://localhost/api/jobs/run-global-watch", "wrong-secret"));
    expect(unauthorized.status).toBe(401);
    expect(runGlobalWatchMock).not.toHaveBeenCalled();

    const legitimate = await jobsGlobalWatchGet(cronRequest("http://localhost/api/jobs/run-global-watch"));
    expect(legitimate.status).toBe(200);
    expect(runGlobalWatchMock).toHaveBeenCalledTimes(1);
  });
});

describe("Caso 17 — rate limit manual", () => {
  it("una solicitud manual ya limitada no adquiere lock ni ejecuta el pipeline", async () => {
    // Exhaust vigia_manual_run's quota (3/900s) for this operator directly
    // through the same shared rate limiter the route uses.
    const fakeRequest = manualRequest("http://localhost/api/vigia/run");
    for (let i = 0; i < 3; i += 1) {
      const outcome = await enforceRateLimit({
        policy: "vigia_manual_run",
        request: fakeRequest,
        identity: { userId: OPERATOR.id },
      });
      expect(outcome.allowed).toBe(true);
    }

    const response = await vigiaRunPost(fakeRequest);
    expect(response.status).toBe(429);
    expect(runGlobalWatchMock).not.toHaveBeenCalled();

    // The lock itself was never touched by the rate-limited request.
    const stillFree = await acquireJobLock({ name: "global-watch", runId: "still-free" });
    expect(stillFree.acquired).toBe(true);
    if (stillFree.acquired) await stillFree.release();
  });
});

describe("Caso 18 — idempotency key invalida", () => {
  it("400 antes de adquirir el lock", async () => {
    const response = await jobsGlobalWatchGet(
      cronRequest("http://localhost/api/jobs/run-global-watch", CRON_SECRET, {
        "x-argus-run-id": "bad key with spaces and $ymbols!",
      })
    );
    expect(response.status).toBe(400);
    expect(runGlobalWatchMock).not.toHaveBeenCalled();

    const stillFree = await acquireJobLock({ name: "global-watch", runId: "after-bad-key" });
    expect(stillFree.acquired).toBe(true);
    if (stillFree.acquired) await stillFree.release();
  });
});

describe("Caso 13 (endpoint) — lock SENAPRED compartido entre pipelines", () => {
  it("Chile Alerts se salta la promocion cuando Global Watch ya tiene el lock senapred-ingestion", async () => {
    const senapredHeld = await acquireJobLock({ name: "senapred-ingestion", runId: "global-watch-senapred" });
    expect(senapredHeld.acquired).toBe(true);

    const response = await jobsChileAlertsGet(cronRequest("http://localhost/api/jobs/run-chile-alerts"));
    // The outer chile-alerts pipeline lock is still free, so the request
    // succeeds at 200 — but the inner senapred-ingestion critical section
    // must have been skipped, not executed concurrently.
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("skipped_senapred_lock");
    expect(fetchChileOfficialAlertsRawMock).not.toHaveBeenCalled();
    expect(promoteChileOfficialAlertsMock).not.toHaveBeenCalled();

    if (senapredHeld.acquired) await senapredHeld.release();
  });

  it("sin contencion, Chile Alerts adquiere y libera el lock senapred-ingestion normalmente", async () => {
    const response = await jobsChileAlertsGet(cronRequest("http://localhost/api/jobs/run-chile-alerts"));
    expect(response.status).toBe(200);
    expect(promoteChileOfficialAlertsMock).toHaveBeenCalledTimes(1);

    const afterCompletion = await acquireJobLock({ name: "senapred-ingestion", runId: "post-chile-alerts" });
    expect(afterCompletion.acquired).toBe(true);
    if (afterCompletion.acquired) await afterCompletion.release();
  });
});

describe("Caso 14 — reintento HTTP con la misma idempotency key", () => {
  it("dos solicitudes secuenciales con la misma key no dejan el lock atascado y ambas completan limpiamente", async () => {
    const headers = { "x-argus-run-id": "argus-run-global-watch-100-1" };
    const first = await jobsGlobalWatchGet(cronRequest("http://localhost/api/jobs/run-global-watch", CRON_SECRET, headers));
    expect(first.status).toBe(200);

    // Sequential retry (curl-style, after the first attempt already
    // finished and released its lock) with the identical key — proves the
    // lock lifecycle doesn't leak/stick across retries of the same runId.
    const second = await jobsGlobalWatchGet(cronRequest("http://localhost/api/jobs/run-global-watch", CRON_SECRET, headers));
    expect(second.status).toBe(200);
    expect(runGlobalWatchMock).toHaveBeenCalledTimes(2);
  });
});

describe("Caso 12 — dos pipelines distintos sin lock compartido", () => {
  it("Global Watch y Chile Alerts corren simultaneamente sin bloquearse entre si", async () => {
    const globalWatchLock = await acquireJobLock({ name: "global-watch", runId: "gw-concurrent" });
    expect(globalWatchLock.acquired).toBe(true);

    const chileAlertsResponse = await jobsChileAlertsGet(cronRequest("http://localhost/api/jobs/run-chile-alerts"));
    expect(chileAlertsResponse.status).toBe(200);

    if (globalWatchLock.acquired) await globalWatchLock.release();
  });
});

describe("Chile Alerts manual (chile-alerts/run) — lock y auth", () => {
  it("lock no adquirido -> motor no llamado", async () => {
    const held = await acquireJobLock({ name: "chile-alerts", runId: "external-holder" });
    expect(held.acquired).toBe(true);

    const response = await chileAlertsRunPost(manualRequest("http://localhost/api/chile-alerts/run"));
    expect(response.status).toBe(409);
    expect(promoteChileOfficialAlertsMock).not.toHaveBeenCalled();

    if (held.acquired) await held.release();
  });

  it("motor falla -> release llamado, siguiente intento adquiere el lock", async () => {
    promoteChileOfficialAlertsMock.mockRejectedValueOnce(new Error("db exploded"));
    const response = await chileAlertsRunPost(manualRequest("http://localhost/api/chile-alerts/run"));
    expect(response.status).toBe(502);

    const nextAttempt = await acquireJobLock({ name: "chile-alerts", runId: "post-failure" });
    expect(nextAttempt.acquired).toBe(true);
    if (nextAttempt.acquired) await nextAttempt.release();
  });
});
