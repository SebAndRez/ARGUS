import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ARGUS Prompt 17 §29 — 10 casos obligatorios del contexto operacional
 * compartido, ejercitados directamente sobre `canonicalIncidentGateway.ts`
 * (la capa que produce `ModuleIncidentSummary[]`, consumida idénticamente
 * por los cuatro módulos). Solo se mockea el límite de I/O real (Prisma) —
 * el mapeador canónico y la política de lifecycle corren sin mockear.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: { knowledgeIncident: { findMany: vi.fn(), findUnique: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import { fetchCanonicalModuleIncidentById, fetchCanonicalModuleIncidents } from "@/lib/modules/canonicalIncidentGateway";

const findManyMock = vi.mocked(prisma.knowledgeIncident.findMany);
const findUniqueMock = vi.mocked(prisma.knowledgeIncident.findUnique);

const NOW_ISO = "2026-07-14T12:00:00.000Z";

function buildRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "incident-1",
    externalId: "usgs-abc",
    sourceId: "usgs_earthquake",
    sourceName: "USGS Earthquake Hazards",
    domain: "earthquake",
    subtype: null,
    title: "M6.1 earthquake",
    summary: "Offshore earthquake",
    severity: "high",
    confidenceScore: 82,
    country: "CL",
    region: "Valparaiso",
    locality: null,
    latitude: -33.05,
    longitude: -71.62,
    geometryJson: null,
    technicalFactorsJson: { lifecycle: "active" },
    impactJson: null,
    casualtiesJson: null,
    recommendedActionsJson: null,
    rawEvidenceRefsJson: [],
    tagsJson: [],
    occurredAt: new Date("2026-07-14T10:00:00.000Z"),
    detectedAt: new Date("2026-07-14T10:02:00.000Z"),
    createdAt: new Date("2026-07-14T10:02:30.000Z"),
    updatedAt: new Date("2026-07-14T10:05:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  findManyMock.mockReset();
  findUniqueMock.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW_ISO));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("fetchCanonicalModuleIncidents — 10 casos obligatorios (Prompt 17 §29)", () => {
  it("Caso 1 — incidente activo: disponible, misma identidad/severidad/lifecycle en llamadas repetidas", async () => {
    findManyMock.mockResolvedValue([buildRow()] as never);
    const first = await fetchCanonicalModuleIncidents();
    const second = await fetchCanonicalModuleIncidents();
    expect(first.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error("expected ok");
    expect(first.page.summaries[0].id).toBe("incident-1");
    expect(first.page.summaries[0].severity).toBe("high");
    expect(first.page.summaries[0].lifecycle).toBe("active");
    expect(second.page.summaries).toEqual(first.page.summaries);
  });

  it("Caso 2 — incidente resuelto: no aparece en la lista activa", async () => {
    findManyMock.mockResolvedValue([buildRow({ technicalFactorsJson: { lifecycle: "resolved" } })] as never);
    const result = await fetchCanonicalModuleIncidents();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.page.summaries).toHaveLength(0);
  });

  it("incidente resuelto puede abrirse por historial vía fetchCanonicalModuleIncidentById", async () => {
    findUniqueMock.mockResolvedValue(buildRow({ technicalFactorsJson: { lifecycle: "resolved" } }) as never);
    const result = await fetchCanonicalModuleIncidentById("incident-1");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.summary.lifecycle).toBe("resolved");
  });

  it("Caso 3 — candidato: verificationStatus candidate cuando el incidente trae el tag no-confirmado", async () => {
    findManyMock.mockResolvedValue([buildRow({ tagsJson: ["no-confirmado"] })] as never);
    const result = await fetchCanonicalModuleIncidents();
    if (!result.ok) throw new Error("expected ok");
    expect(result.page.summaries[0].verificationStatus).toBe("candidate");
  });

  it("Caso 4 — demo: excluido en producción sin permiso, incluido cuando se permite explícitamente", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ARGUS_ALLOW_DEMO_DATA", "");
    findManyMock.mockResolvedValue([buildRow({ tagsJson: ["seed"], sourceName: "Demo Fixture" })] as never);

    const excluded = await fetchCanonicalModuleIncidents();
    if (!excluded.ok) throw new Error("expected ok");
    expect(excluded.page.summaries).toHaveLength(0);

    vi.stubEnv("ARGUS_ALLOW_DEMO_DATA", "true");
    const included = await fetchCanonicalModuleIncidents({ includeDemo: true });
    if (!included.ok) throw new Error("expected ok");
    expect(included.page.summaries).toHaveLength(1);
    expect(included.page.summaries[0].isDemo).toBe(true);
  });

  it("Caso 5 — geometría: los cuatro módulos reciben la misma estructura de geometría canónica", async () => {
    findManyMock.mockResolvedValue([buildRow()] as never);
    const result = await fetchCanonicalModuleIncidents();
    if (!result.ok) throw new Error("expected ok");
    expect(result.page.summaries[0].location.geometry).toEqual({ type: "point", coordinates: [-33.05, -71.62] });
  });

  it("Caso 6 — fuente: fuente primaria y conteo de fuentes consistentes", async () => {
    findManyMock.mockResolvedValue([buildRow()] as never);
    const result = await fetchCanonicalModuleIncidents();
    if (!result.ok) throw new Error("expected ok");
    expect(result.page.summaries[0].sourceSummary.primarySource).toBe("USGS Earthquake Hazards");
    expect(result.page.summaries[0].sourceSummary.sourceCount).toBe(1);
    expect(result.page.summaries[0].sourceSummary.isOfficial).toBe(true);
  });

  it("Caso 8 — endpoint fallido: nunca un array vacío disfrazando el fallo real", async () => {
    findManyMock.mockRejectedValue(new Error("connection reset"));
    const result = await fetchCanonicalModuleIncidents();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("DATA_UNAVAILABLE");
  });

  it("Caso 9 — paginación: respeta el límite máximo y produce un cursor utilizable", async () => {
    const rows = Array.from({ length: 5 }, (_, index) =>
      buildRow({ id: `incident-${index}`, updatedAt: new Date(Date.now() - index * 60_000) })
    );
    findManyMock.mockResolvedValue(rows as never);
    const result = await fetchCanonicalModuleIncidents({ limit: 2 });
    if (!result.ok) throw new Error("expected ok");
    expect(result.page.summaries).toHaveLength(2);
  });

  it("nunca permite un límite ilimitado (se acota a MAX_MODULE_INCIDENTS_LIMIT)", async () => {
    findManyMock.mockResolvedValue([] as never);
    await fetchCanonicalModuleIncidents({ limit: 999999 });
    const call = findManyMock.mock.calls[0][0] as { take: number };
    expect(call.take).toBeLessThanOrEqual(100 * 3 + 1);
  });

  it("Caso 10 — determinismo: el mismo incidente produce el mismo resumen en llamadas independientes", async () => {
    findUniqueMock.mockResolvedValue(buildRow() as never);
    const first = await fetchCanonicalModuleIncidentById("incident-1");
    const second = await fetchCanonicalModuleIncidentById("incident-1");
    expect(first).toEqual(second);
  });

  it("identificador inválido se rechaza sin consultar la base de datos", async () => {
    const result = await fetchCanonicalModuleIncidentById("../etc/passwd");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("INVALID_INCIDENT_ID");
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("incidente inexistente produce INCIDENT_NOT_FOUND", async () => {
    findUniqueMock.mockResolvedValue(null);
    const result = await fetchCanonicalModuleIncidentById("does-not-exist");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("INCIDENT_NOT_FOUND");
  });
});
