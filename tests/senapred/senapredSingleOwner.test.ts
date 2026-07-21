import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ING-FINAL-001 — SENAPRED single-owner verification.
 *
 * Prior consolidation work (Prompt 13/14, see `chileAlertPromotionEngine.ts`
 * and `senapredEventosAdapter.ts` doc comments) already collapsed what used
 * to be a second independent AppSync pagination loop into one canonical
 * pipeline: `fetchChileOfficialAlertsRaw()` (single fetch) →
 * `promoteChileOfficialAlerts()` (single normalizer + persistence), guarded
 * by the shared `senapred-ingestion` job lock. This suite proves, at the
 * pipeline level (not just by reading source comments), that:
 *
 * 1. The manual trigger (`/api/chile-alerts/run`), the scheduled-job alias
 *    (`/api/jobs/run-chile-alerts`), and Global Watch's own SENAPRED step
 *    (`runGlobalWatch({ onlySources: ["senapred_eventos"] })`) all resolve
 *    to the exact same `promoteChileOfficialAlerts` function reference —
 *    not three implementations that happen to behave similarly.
 * 2. Source Health (`GET /api/sources/status`) never calls any SENAPRED
 *    fetch/promotion function — it only reads persisted `IngestionRun`/
 *    `ExternalEvent` rows.
 *
 * Mocking strategy: only the real I/O boundary is mocked (the AppSync-facing
 * fetch, and the Prisma-backed persistence functions) — the real route
 * handlers, `runChileAlertsIngestion`, and the real `runGlobalWatch` all run
 * unmocked, so a genuine second implementation slipping into either path
 * would be caught by `promoteChileOfficialAlertsMock` not being the one
 * invoked. No test touches AppSync, Redis, or Supabase (global `fetch` is
 * blocked by tests/setup.ts regardless).
 */

vi.mock("@/services/authService", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/sources/chile/senapredProvider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sources/chile/senapredProvider")>();
  return { ...actual, fetchChileOfficialAlertsRaw: vi.fn() };
});

vi.mock("@/lib/incidents/chileAlertPromotionEngine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/incidents/chileAlertPromotionEngine")>();
  return { ...actual, promoteChileOfficialAlerts: vi.fn(actual.promoteChileOfficialAlerts) };
});

vi.mock("@/lib/knowledge-intake/persistence/knowledgePersistenceService", () => ({
  createIngestionRun: vi.fn().mockResolvedValue({ id: "run-1" }),
  finishIngestionRun: vi.fn().mockResolvedValue(undefined),
  saveKnowledgeEvidenceIfNew: vi.fn().mockResolvedValue({ action: "inserted", evidence: {} }),
  upsertKnowledgeIncidentByExternalId: vi.fn().mockImplementation(async (incident: { id: string }) => ({
    action: "inserted",
    incident: { ...incident, id: `persisted-${incident.id}` },
  })),
  getRecentIngestionRunsBySource: vi.fn().mockResolvedValue(new Map()),
  findWildfireCorrelationCandidates: vi.fn().mockResolvedValue([]),
  attachWildfireEvidenceToExistingIncident: vi.fn(),
}));

vi.mock("@/lib/vigia/incidentLifecycle", () => ({
  sweepIncidentLifecycles: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    externalEvent: { groupBy: vi.fn().mockResolvedValue([]) },
    ingestionRun: { findMany: vi.fn().mockResolvedValue([]) },
    // ARGUS Fusion Engine (`masterIncidentEngine.ts`) — runGlobalWatch ahora
    // corre esta correlación cross-amenaza como paso final; sin anclas
    // encontradas (findMany vacío) sale de inmediato sin tocar el resto.
    knowledgeIncident: { findMany: vi.fn().mockResolvedValue([]) },
    incidentRelation: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
    criticalPoi: { findMany: vi.fn().mockResolvedValue([]) },
    auditLog: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
  },
}));

import { NextRequest } from "next/server";
import { getCurrentUser } from "@/services/authService";
import { fetchChileOfficialAlertsRaw } from "@/lib/sources/chile/senapredProvider";
import { promoteChileOfficialAlerts } from "@/lib/incidents/chileAlertPromotionEngine";
import { runGlobalWatch } from "@/lib/vigia/globalWatchEngine";
import { POST as chileAlertsRunPost } from "@/app/api/chile-alerts/run/route";
import { GET as jobsChileAlertsGet } from "@/app/api/jobs/run-chile-alerts/route";
import { GET as sourcesStatusGet } from "@/app/api/sources/status/route";
import { resetMemoryJobLocksForTests } from "@/lib/jobs/jobLockBackend";
import { resetMemoryRateLimitBackendForTests } from "@/lib/security/rateLimitBackend";

const getCurrentUserMock = vi.mocked(getCurrentUser);
const fetchChileOfficialAlertsRawMock = vi.mocked(fetchChileOfficialAlertsRaw);
const promoteChileOfficialAlertsMock = vi.mocked(promoteChileOfficialAlerts);

const OPERATOR = { id: "operator-senapred-owner-test", role: "OPERATOR" };
const CRON_SECRET = "test-senapred-cron-secret";

const rawAlert = {
  title: "Se declara Alerta Roja por incendio forestal",
  region: "Valparaíso",
  threatText: "Incendio forestal de gran magnitud.",
  levelText: "Alerta Roja",
  issuedAt: "2026-07-14T10:00:00.000Z",
  updatedAt: "2026-07-14T10:00:00.000Z",
  sourceId: "senapred_eventos" as const,
  evidenceUrl: "https://www.senapred.cl/eventos/alerta-1",
};

function manualRequest() {
  return new NextRequest("http://localhost/api/chile-alerts/run", {
    method: "POST",
    headers: { "Idempotency-Key": "manual-run-1" },
  });
}

function cronRequest() {
  return new NextRequest("http://localhost/api/jobs/run-chile-alerts", {
    method: "GET",
    headers: { authorization: `Bearer ${CRON_SECRET}`, "Idempotency-Key": "cron-run-1" },
  });
}

beforeEach(() => {
  resetMemoryJobLocksForTests();
  resetMemoryRateLimitBackendForTests();
  process.env.CRON_SECRET = CRON_SECRET;
  getCurrentUserMock.mockResolvedValue(OPERATOR as never);
  fetchChileOfficialAlertsRawMock.mockResolvedValue({ alerts: [rawAlert], warnings: [], errors: [] });
});

afterEach(() => {
  vi.clearAllMocks();
  resetMemoryJobLocksForTests();
  resetMemoryRateLimitBackendForTests();
  delete process.env.CRON_SECRET;
});

describe("Owner canónico único — mismo servicio para los 3 disparadores", () => {
  it("manual (/api/chile-alerts/run) invoca promoteChileOfficialAlerts", async () => {
    const response = await chileAlertsRunPost(manualRequest());
    expect(response.status).toBe(200);
    expect(promoteChileOfficialAlertsMock).toHaveBeenCalledTimes(1);
    expect(promoteChileOfficialAlertsMock).toHaveBeenCalledWith([rawAlert]);
  });

  it("scheduler (/api/jobs/run-chile-alerts) invoca la MISMA función promoteChileOfficialAlerts, no una copia", async () => {
    const response = await jobsChileAlertsGet(cronRequest());
    expect(response.status).toBe(200);
    expect(promoteChileOfficialAlertsMock).toHaveBeenCalledTimes(1);
    expect(promoteChileOfficialAlertsMock).toHaveBeenCalledWith([rawAlert]);
  });

  it("Global Watch (runSenapredSource, vía runGlobalWatch) también invoca la MISMA función promoteChileOfficialAlerts", async () => {
    const summary = await runGlobalWatch({ onlySources: ["senapred_eventos"] });
    const senapredSummary = summary.sources.find((source) => source.sourceId === "senapred_eventos");
    expect(senapredSummary?.status).not.toBe("failed");
    expect(promoteChileOfficialAlertsMock).toHaveBeenCalledTimes(1);
    expect(promoteChileOfficialAlertsMock).toHaveBeenCalledWith([rawAlert]);
  });

  it("los 3 disparadores usan fetchChileOfficialAlertsRaw exactamente una vez cada uno — nunca su propia paginación paralela", async () => {
    await chileAlertsRunPost(manualRequest());
    expect(fetchChileOfficialAlertsRawMock).toHaveBeenCalledTimes(1);

    fetchChileOfficialAlertsRawMock.mockClear();
    await jobsChileAlertsGet(cronRequest());
    expect(fetchChileOfficialAlertsRawMock).toHaveBeenCalledTimes(1);

    fetchChileOfficialAlertsRawMock.mockClear();
    await runGlobalWatch({ onlySources: ["senapred_eventos"] });
    expect(fetchChileOfficialAlertsRawMock).toHaveBeenCalledTimes(1);
  });
});

describe("Source Health no vuelve a consultar SENAPRED", () => {
  it("GET /api/sources/status nunca invoca fetchChileOfficialAlertsRaw ni promoteChileOfficialAlerts", async () => {
    const response = await sourcesStatusGet();
    expect(response.status).toBe(200);
    expect(fetchChileOfficialAlertsRawMock).not.toHaveBeenCalled();
    expect(promoteChileOfficialAlertsMock).not.toHaveBeenCalled();
  });
});

describe("Duplicados entre disparadores distintos no crean incidentes distintos", () => {
  it("una corrida manual seguida de una corrida via Global Watch para la misma alerta actualiza el mismo incidente, no crea uno nuevo", async () => {
    await chileAlertsRunPost(manualRequest());
    const firstCallArg = promoteChileOfficialAlertsMock.mock.calls[0][0];
    expect(firstCallArg).toEqual([rawAlert]);

    promoteChileOfficialAlertsMock.mockClear();
    fetchChileOfficialAlertsRawMock.mockResolvedValue({
      alerts: [{ ...rawAlert, title: "Se mantiene Alerta Roja por incendio forestal" }],
      warnings: [],
      errors: [],
    });
    await runGlobalWatch({ onlySources: ["senapred_eventos"] });

    // Same underlying promotion function, same identity inputs (threat+area+day)
    // — the dedup guarantee lives inside promoteChileOfficialAlerts/upsertKnowledgeIncidentByExternalId,
    // already covered by tests/senapred/senapredConsolidation.test.ts Caso 2/3;
    // what this test adds is proving BOTH triggers reach that exact function.
    expect(promoteChileOfficialAlertsMock).toHaveBeenCalledTimes(1);
  });
});
