import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ARGUS Prompt 19 §43 — 3 cadenas de contrato end-to-end, con mocks (nunca
 * infraestructura real): job exitoso → fuente exitosa → salud sana; una
 * degradación real (proyección fallida) se refleja en el snapshot y en
 * `activeIssues`; una fuente sin ejecutar nunca se declara `healthy`.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: vi.fn() },
}));
vi.mock("@/lib/security/rateLimitBackend", () => ({
  determineRateLimitBackendKind: vi.fn(),
}));
vi.mock("@/lib/vigia/sourceOperationsHealth", () => ({
  getSourceOperationsHealth: vi.fn(),
}));
vi.mock("@/lib/knowledge-intake/persistence/knowledgePersistenceService", () => ({
  getRecentIngestionRunsBySource: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { determineRateLimitBackendKind } from "@/lib/security/rateLimitBackend";
import { getSourceOperationsHealth } from "@/lib/vigia/sourceOperationsHealth";
import { getRecentIngestionRunsBySource } from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import { getOperationalHealthSnapshot } from "../../src/lib/observability/operationsSnapshot";
import { logOperationalEvent } from "../../src/lib/observability/operationalEvents";
import { resetRecentIssuesForTests } from "../../src/lib/observability/recentIssuesBuffer";

const queryRawMock = vi.mocked(prisma.$queryRaw);
const backendKindMock = vi.mocked(determineRateLimitBackendKind);
const sourceHealthMock = vi.mocked(getSourceOperationsHealth);
const ingestionRunsMock = vi.mocked(getRecentIngestionRunsBySource);

const NOW = new Date("2026-07-15T12:00:00.000Z");

function freshRunsMap(sourceIds: string[], minutesAgo: number, status: "success" | "partial" = "success") {
  const map = new Map<string, Array<{ status: string; startedAt: Date }>>();
  for (const id of sourceIds) {
    map.set(id, [{ status, startedAt: new Date(NOW.getTime() - minutesAgo * 60_000) }]);
  }
  return map as ReturnType<typeof getRecentIngestionRunsBySource> extends Promise<infer T> ? T : never;
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgres://test");
  vi.stubEnv("AUTH_SECRET", "test-secret");
  vi.stubEnv("CRON_SECRET", "test-cron-secret");
  resetRecentIssuesForTests();
  queryRawMock.mockReset();
  backendKindMock.mockReset();
  sourceHealthMock.mockReset();
  ingestionRunsMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetRecentIssuesForTests();
});

describe("getOperationalHealthSnapshot — cadena 1: todo exitoso → healthy", () => {
  it("persistencia ok, backend distribuido ok, pipelines frescos, fuentes operativas → overallStatus healthy", async () => {
    queryRawMock.mockResolvedValue([{ "?column?": 1 }]);
    backendKindMock.mockReturnValue("distributed");
    sourceHealthMock.mockResolvedValue([
      { source: { id: "usgs_earthquake" } as never, signal: {} as never, verdict: { status: "operational", reason: "ok" } },
    ]);
    ingestionRunsMock.mockImplementation(async (sourceIds: string[]) => freshRunsMap(sourceIds, 5));

    const snapshot = await getOperationalHealthSnapshot(NOW);

    expect(snapshot.persistence.status).toBe("healthy");
    expect(snapshot.distributedBackend.status).toBe("healthy");
    expect(snapshot.pipelines.every((p) => p.status === "healthy")).toBe(true);
    expect(snapshot.sources.status).toBe("healthy");
    expect(snapshot.overallStatus).toBe("healthy");
  });
});

describe("getOperationalHealthSnapshot — cadena 2: proyección fallida → degradado, problema activo", () => {
  it("un map_projection_dropped reciente degrada `projections` y aparece en activeIssues, sin declarar unavailable", async () => {
    queryRawMock.mockResolvedValue([{ "?column?": 1 }]);
    backendKindMock.mockReturnValue("distributed");
    sourceHealthMock.mockResolvedValue([
      { source: { id: "usgs_earthquake" } as never, signal: {} as never, verdict: { status: "operational", reason: "ok" } },
    ]);
    ingestionRunsMock.mockImplementation(async (sourceIds: string[]) => freshRunsMap(sourceIds, 5));

    logOperationalEvent({
      event: "map_projection_dropped",
      level: "warn",
      component: "map_projection",
      count: 3,
      detail: { source: "vigia_events" },
    });

    const snapshot = await getOperationalHealthSnapshot(NOW);

    expect(snapshot.projections.status).toBe("degraded");
    expect(snapshot.overallStatus).toBe("degraded");
    expect(snapshot.overallStatus).not.toBe("unavailable");
    expect(snapshot.activeIssues.some((issue) => issue.component === "map_projection")).toBe(true);
    expect(snapshot.activeIssues.find((issue) => issue.component === "map_projection")?.runbookId).toBe(
      "incidente-critico-no-aparece-en-mapa"
    );
  });
});

describe("getOperationalHealthSnapshot — cadena 3: fuente no ejecutada → nunca healthy", () => {
  it("getSourceOperationsHealth vacío (sin evidencia) produce sources unknown y overallStatus distinto de healthy", async () => {
    queryRawMock.mockResolvedValue([{ "?column?": 1 }]);
    backendKindMock.mockReturnValue("distributed");
    sourceHealthMock.mockResolvedValue([]);
    ingestionRunsMock.mockImplementation(async (sourceIds: string[]) => freshRunsMap(sourceIds, 5));

    const snapshot = await getOperationalHealthSnapshot(NOW);

    expect(snapshot.sources.status).toBe("unknown");
    expect(snapshot.sources.total).toBe(0);
    expect(snapshot.overallStatus).not.toBe("healthy");
  });
});

describe("getOperationalHealthSnapshot — persistencia caída es crítico", () => {
  it("prisma.$queryRaw lanza → persistence unavailable → overallStatus unavailable", async () => {
    queryRawMock.mockRejectedValue(new Error("connection refused"));
    backendKindMock.mockReturnValue("distributed");
    sourceHealthMock.mockResolvedValue([]);
    ingestionRunsMock.mockResolvedValue(new Map());

    const snapshot = await getOperationalHealthSnapshot(NOW);

    expect(snapshot.persistence.status).toBe("unavailable");
    expect(snapshot.overallStatus).toBe("unavailable");
  });
});

describe("getOperationalHealthSnapshot — pipeline sin ejecuciones no se declara healthy", () => {
  it("sin ninguna corrida registrada para un pipeline, su estado es unknown, no healthy", async () => {
    queryRawMock.mockResolvedValue([{ "?column?": 1 }]);
    backendKindMock.mockReturnValue("distributed");
    sourceHealthMock.mockResolvedValue([]);
    ingestionRunsMock.mockResolvedValue(new Map());

    const snapshot = await getOperationalHealthSnapshot(NOW);

    for (const pipeline of snapshot.pipelines) {
      expect(pipeline.status).not.toBe("healthy");
      expect(pipeline.lastSuccessAt).toBeNull();
    }
  });
});
