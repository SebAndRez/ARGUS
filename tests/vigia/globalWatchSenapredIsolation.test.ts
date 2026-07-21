import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Audit 2026-07-21 — structural gap that turned the two N+1 fixes (see
 * `tests/senapred/senapredProviderConcurrency.test.ts` and
 * `chileAlertPromotionConcurrency.test.ts`) into a full-job 300s timeout:
 * `runGlobalWatch()` used to await `runSenapredSource()` directly, with NO
 * `runWithTimeout` wrapper — unlike every other source. Since that call sat
 * inside the same top-level `Promise.all` as every other source, one slow
 * SENAPRED run blocked the entire job (persistence, lifecycle, response)
 * from ever completing, not just the SENAPRED entry in the summary.
 *
 * This suite proves the fix: a SENAPRED fetch that never resolves no longer
 * prevents other sources from completing and being reported.
 */

vi.mock("@/lib/knowledge-intake/adapters/gdacsAdapter", () => ({
  fetchGdacsEvents: vi.fn(),
}));
vi.mock("@/lib/sources/chile/senapredProvider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sources/chile/senapredProvider")>();
  return { ...actual, fetchChileOfficialAlertsRaw: vi.fn() };
});
vi.mock("@/lib/vigia/sourceOperationsRegistry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/vigia/sourceOperationsRegistry")>();
  return {
    ...actual,
    // Shrink only senapred_eventos's budget so this test doesn't need to
    // wait out the real (20s) registry value — everything else keeps its
    // real declared timeout.
    getSourceDefinition: (id: string) =>
      id === "senapred_eventos" ? { ...actual.getSourceDefinition(id), timeoutMs: 10 } : actual.getSourceDefinition(id),
  };
});
vi.mock("@/lib/vigia/incidentLifecycle", () => ({
  sweepIncidentLifecycles: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/knowledge-intake/persistence/knowledgePersistenceService", () => ({
  createIngestionRun: vi.fn().mockResolvedValue({ id: "run-1" }),
  finishIngestionRun: vi.fn().mockResolvedValue(undefined),
  saveKnowledgeEvidenceIfNew: vi.fn().mockResolvedValue({ action: "inserted", evidence: {} }),
  upsertKnowledgeIncidentByExternalId: vi.fn().mockImplementation(async (incident) => ({
    action: "inserted",
    incident: { ...incident, id: `persisted-${incident.id}` },
  })),
  findWildfireCorrelationCandidates: vi.fn().mockResolvedValue([]),
  attachWildfireEvidenceToExistingIncident: vi.fn(),
  getRecentIngestionRunsBySource: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    knowledgeIncident: { findMany: vi.fn().mockResolvedValue([]) },
    incidentRelation: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
    criticalPoi: { findMany: vi.fn().mockResolvedValue([]) },
    auditLog: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
  },
}));

import { fetchGdacsEvents } from "@/lib/knowledge-intake/adapters/gdacsAdapter";
import { fetchChileOfficialAlertsRaw } from "@/lib/sources/chile/senapredProvider";
import { runGlobalWatch } from "@/lib/vigia/globalWatchEngine";
import { resetMemoryJobLocksForTests } from "@/lib/jobs/jobLockBackend";
import { resetMemoryRateLimitBackendForTests } from "@/lib/security/rateLimitBackend";

const fetchGdacsMock = vi.mocked(fetchGdacsEvents);
const fetchChileOfficialAlertsRawMock = vi.mocked(fetchChileOfficialAlertsRaw);

beforeEach(() => {
  resetMemoryJobLocksForTests();
  resetMemoryRateLimitBackendForTests();
  fetchGdacsMock.mockResolvedValue({ fetched: 0, incidents: [], warnings: [], errors: [] } as never);
  // Never resolves — simulates the unbounded sequential AppSync/DB work
  // observed in production before the N+1 fixes.
  fetchChileOfficialAlertsRawMock.mockImplementation(() => new Promise(() => {}));
});

afterEach(() => {
  vi.clearAllMocks();
  resetMemoryJobLocksForTests();
  resetMemoryRateLimitBackendForTests();
});

describe("runGlobalWatch — una fuente SENAPRED colgada no bloquea el resto del job", () => {
  it("gdacs (y el resto del job) se completa igual, aunque SENAPRED nunca resuelva", async () => {
    const summary = await runGlobalWatch({ onlySources: ["senapred_eventos", "gdacs"] });

    const gdacsSummary = summary.sources.find((s) => s.sourceId === "gdacs");
    expect(gdacsSummary?.status).toBe("success");

    const senapredSummary = summary.sources.find((s) => s.sourceId === "senapred_eventos");
    expect(senapredSummary?.status).toBe("failed");
    expect(senapredSummary?.errors[0]).toMatch(/timeout|excedió|exceeded/i);

    // El job global termina (no queda colgado esperando a SENAPRED para siempre).
    expect(summary.status).toBe("partial");
    expect(summary.totals.failedSources).toBeGreaterThanOrEqual(1);
    // Fase 6 — el endpoint debe devolver métricas reales, no un "ok" genérico:
    // los totales existen y son consistentes con lo que de verdad ocurrió.
    expect(summary.totals).toEqual({
      received: gdacsSummary?.fetched ?? 0,
      created: 0,
      updated: 0,
      discarded: 0,
      failedSources: summary.totals.failedSources,
    });
  });

  it("termina en un tiempo acotado por el timeout declarado, no indefinidamente", async () => {
    const start = Date.now();
    await runGlobalWatch({ onlySources: ["senapred_eventos", "gdacs"] });
    const elapsed = Date.now() - start;

    // Generoso: el timeout mockeado de SENAPRED es 10ms; cualquier valor muy
    // por debajo de un timeout real (segundos) demuestra que no se esperó
    // indefinidamente a la promesa colgada.
    expect(elapsed).toBeLessThan(2000);
  });
});
