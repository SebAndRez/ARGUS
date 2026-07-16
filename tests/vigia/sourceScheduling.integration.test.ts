import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ARGUS Prompt 16 §29 — integración ligera: registro → selección por
 * vencimiento → lock → adaptador → persistencia → health, ejercitando el
 * `runGlobalWatch()` real con solo los adaptadores/persistencia mockeados
 * (mismo patrón que `wildfireCorrelationEngine.integration.test.ts`). Cero
 * red real, cero Supabase, cero Redis de producción, cero credenciales
 * reales.
 *
 * Demuestra explícitamente los dos enunciados del Prompt 16 §29:
 * - "adaptador existente pero no programado → nunca se declara operativo"
 *   (cubierto también en `sourceOperationsRegistry.test.ts` Caso 2/16 a
 *   nivel de función pura; aquí se demuestra a nivel de pipeline: una
 *   fuente que no está vencida no se fetchea en absoluto).
 * - "fuente programada con respuesta válida vacía → saludable" (Caso 20
 *   parcial incluido).
 */

vi.mock("@/lib/knowledge-intake/adapters/usgsAdapter", () => ({
  fetchUsgsEarthquakes: vi.fn(),
}));
vi.mock("@/lib/knowledge-intake/adapters/gdacsAdapter", () => ({
  fetchGdacsEvents: vi.fn(),
}));
vi.mock("@/lib/vigia/incidentLifecycle", () => ({
  sweepIncidentLifecycles: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/knowledge-intake/persistence/knowledgePersistenceService", () => ({
  createIngestionRun: vi.fn().mockResolvedValue({ id: "run-1" }),
  finishIngestionRun: vi.fn().mockResolvedValue(undefined),
  saveKnowledgeEvidenceIfNew: vi.fn().mockResolvedValue({ action: "inserted", evidence: {} }),
  upsertKnowledgeIncidentByExternalId: vi.fn().mockImplementation(async (incident) => ({
    action: "inserted",
    incident: { id: `persisted-${incident.id}`, ...incident },
  })),
  findWildfireCorrelationCandidates: vi.fn().mockResolvedValue([]),
  attachWildfireEvidenceToExistingIncident: vi.fn(),
  getRecentIngestionRunsBySource: vi.fn(),
}));

import { fetchUsgsEarthquakes } from "@/lib/knowledge-intake/adapters/usgsAdapter";
import { fetchGdacsEvents } from "@/lib/knowledge-intake/adapters/gdacsAdapter";
import { getRecentIngestionRunsBySource } from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import { runGlobalWatch } from "@/lib/vigia/globalWatchEngine";

const fetchUsgsMock = vi.mocked(fetchUsgsEarthquakes);
const fetchGdacsMock = vi.mocked(fetchGdacsEvents);
const getRecentRunsMock = vi.mocked(getRecentIngestionRunsBySource);

const NOW_ISO = "2026-07-14T12:00:00.000Z";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW_ISO));
  fetchUsgsMock.mockReset();
  fetchGdacsMock.mockReset();
  getRecentRunsMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("runGlobalWatch — scheduler real por fuente (Prompt 16)", () => {
  it("una fuente no vencida (dentro de su intervalo) no se fetchea en absoluto", async () => {
    // usgs_earthquake: intervalo 5 min, última corrida hace 2 min → NO vencida.
    getRecentRunsMock.mockResolvedValue(
      new Map([["usgs_earthquake", [{ status: "success", startedAt: new Date(Date.now() - 2 * 60_000), finishedAt: new Date(), errorMessage: null, recordsFetched: 3 }]]]) as never
    );

    const summary = await runGlobalWatch({ onlySources: ["usgs_earthquake"] });

    expect(fetchUsgsMock).not.toHaveBeenCalled();
    const usgsSummary = summary.sources.find((s) => s.sourceId === "usgs_earthquake");
    expect(usgsSummary?.status).toBe("skipped");
  });

  it("una fuente vencida sí se fetchea", async () => {
    // gdacs: intervalo 15 min, última corrida hace 20 min → vencida.
    getRecentRunsMock.mockResolvedValue(
      new Map([["gdacs", [{ status: "success", startedAt: new Date(Date.now() - 20 * 60_000), finishedAt: new Date(), errorMessage: null, recordsFetched: 1 }]]]) as never
    );
    fetchGdacsMock.mockResolvedValue({ fetched: 0, incidents: [], warnings: [], errors: [] } as never);

    const summary = await runGlobalWatch({ onlySources: ["gdacs"] });

    expect(fetchGdacsMock).toHaveBeenCalledTimes(1);
    const gdacsSummary = summary.sources.find((s) => s.sourceId === "gdacs");
    expect(gdacsSummary?.status).toBe("success");
  });

  it("nunca ejecutada antes: siempre se fetchea (never_run)", async () => {
    getRecentRunsMock.mockResolvedValue(new Map());
    fetchGdacsMock.mockResolvedValue({ fetched: 0, incidents: [], warnings: [], errors: [] } as never);

    await runGlobalWatch({ onlySources: ["gdacs"] });

    expect(fetchGdacsMock).toHaveBeenCalledTimes(1);
  });

  it("fuente programada con respuesta válida vacía → saludable (success, no failed)", async () => {
    getRecentRunsMock.mockResolvedValue(new Map());
    fetchGdacsMock.mockResolvedValue({ fetched: 0, incidents: [], warnings: [], errors: [] } as never);

    const summary = await runGlobalWatch({ onlySources: ["gdacs"] });
    const gdacsSummary = summary.sources.find((s) => s.sourceId === "gdacs");

    expect(gdacsSummary?.status).toBe("success");
    expect(gdacsSummary?.fetched).toBe(0);
    expect(summary.status).not.toBe("failed");
  });

  it("Caso 20 — scheduler parcial: una fuente falla, las demás continúan, resultado global partial", async () => {
    getRecentRunsMock.mockResolvedValue(new Map());
    fetchUsgsMock.mockRejectedValue(new Error("USGS network error"));
    fetchGdacsMock.mockResolvedValue({ fetched: 2, incidents: [], warnings: [], errors: [] } as never);

    const summary = await runGlobalWatch({ onlySources: ["usgs_earthquake", "gdacs"] });

    const usgsSummary = summary.sources.find((s) => s.sourceId === "usgs_earthquake");
    const gdacsSummary = summary.sources.find((s) => s.sourceId === "gdacs");
    expect(usgsSummary?.status).toBe("failed");
    expect(gdacsSummary?.status).toBe("success");
    expect(summary.status).toBe("partial");
    expect(summary.errorsBySource.usgs_earthquake).toBeDefined();
  });

  it("dos fuentes distintas no se bloquean entre sí (locks independientes por sourceId)", async () => {
    getRecentRunsMock.mockResolvedValue(new Map());
    fetchUsgsMock.mockResolvedValue({ count: 0, incidents: [] } as never);
    fetchGdacsMock.mockResolvedValue({ fetched: 0, incidents: [], warnings: [], errors: [] } as never);

    const summary = await runGlobalWatch({ onlySources: ["usgs_earthquake", "gdacs"] });

    expect(fetchUsgsMock).toHaveBeenCalledTimes(1);
    expect(fetchGdacsMock).toHaveBeenCalledTimes(1);
    expect(summary.sources.every((s) => s.status === "success")).toBe(true);
  });
});
