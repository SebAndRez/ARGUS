import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    knowledgeIncident: { findMany: vi.fn() },
    report: { findMany: vi.fn() },
    helpRequest: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { buildCanonicalIncidentPreview, haversineKm, representativePoint } from "@/lib/canonical/canonicalReadLayer";
import type { CanonicalKnowledgeIncidentInput } from "@/lib/canonical/canonicalKnowledgeIncidentToArgusEvent";

const findManyIncidents = vi.mocked(prisma.knowledgeIncident.findMany);
const findManyReports = vi.mocked(prisma.report.findMany);
const findManyHelpRequests = vi.mocked(prisma.helpRequest.findMany);

function buildIncidentRow(overrides: Partial<CanonicalKnowledgeIncidentInput> = {}): CanonicalKnowledgeIncidentInput {
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
    occurredAt: new Date("2026-07-17T10:00:00.000Z"),
    detectedAt: new Date("2026-07-17T10:02:00.000Z"),
    createdAt: new Date("2026-07-17T10:02:30.000Z"),
    updatedAt: new Date("2026-07-17T10:05:00.000Z"),
    ...overrides,
  };
}

function buildReportRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "report-1",
    userId: "user-1",
    category: "fire",
    title: "Humo visible",
    description: "Se ve humo cerca del cerro",
    latitude: -33.0501,
    longitude: -71.6201,
    locationText: null,
    severity: "MEDIUM",
    status: "NEW",
    aiSummary: "Reporte ciudadano: fire, severidad media.",
    aiRecommendation: null,
    aiConfidence: 60,
    falseReportRisk: 20,
    createdAt: new Date("2026-07-17T10:10:00.000Z"),
    updatedAt: new Date("2026-07-17T10:10:00.000Z"),
    user: { publicAlias: "vecino_123" },
    ...overrides,
  };
}

function buildHelpRequestRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "help-1",
    userId: "user-2",
    category: "medical",
    title: "Necesito ayuda",
    description: "Persona atrapada",
    latitude: -10,
    longitude: 10,
    locationText: null,
    priority: "HIGH",
    status: "RECEIVED",
    restrictedMode: false,
    aiSummary: "Solicitud de ayuda: medical, prioridad alta.",
    aiRecommendation: null,
    aiConfidence: 70,
    createdAt: new Date("2026-07-17T10:10:00.000Z"),
    updatedAt: new Date("2026-07-17T10:10:00.000Z"),
    user: { publicAlias: "vecino_456" },
    ...overrides,
  };
}

beforeEach(() => {
  findManyIncidents.mockReset();
  findManyReports.mockReset();
  findManyHelpRequests.mockReset();
});

describe("haversineKm", () => {
  it("es 0 para el mismo punto", () => {
    expect(haversineKm({ lat: -33.05, lng: -71.62 }, { lat: -33.05, lng: -71.62 })).toBe(0);
  });

  it("aproxima correctamente ~111km por grado de latitud en el ecuador", () => {
    const distance = haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(distance).toBeGreaterThan(110);
    expect(distance).toBeLessThan(112);
  });
});

describe("representativePoint", () => {
  it("point → sus propias coordenadas", () => {
    expect(representativePoint({ type: "point", coordinates: [1, 2] })).toEqual({ lat: 1, lng: 2 });
  });

  it("administrative_area → el anchor, nunca el bbox/geojson", () => {
    expect(
      representativePoint({
        type: "administrative_area",
        geojson: { type: "Polygon", coordinates: [[[0, 0]]] },
        regionNames: ["Región X"],
        anchor: [5, 6],
      })
    ).toEqual({ lat: 5, lng: 6 });
  });
});

describe("buildCanonicalIncidentPreview", () => {
  const since = new Date("2026-07-10T00:00:00.000Z");
  const now = new Date("2026-07-17T12:00:00.000Z");

  it("correlaciona un Report dentro de 500m/6h con el incidente más cercano", async () => {
    findManyIncidents.mockResolvedValue([buildIncidentRow()] as never);
    findManyReports.mockResolvedValue([buildReportRow()] as never);
    findManyHelpRequests.mockResolvedValue([] as never);

    const result = await buildCanonicalIncidentPreview({ since, now, includeDemo: false, limit: 200 });

    expect(result.incidents).toHaveLength(1);
    expect(result.correlatedCitizenSignals).toHaveLength(1);
    expect(result.correlatedCitizenSignals[0].incidentId).toBe(result.incidents[0].id);
    expect(result.correlatedCitizenSignals[0].distanceKm).toBeLessThan(0.5);
    expect(result.uncorrelatedCitizenSignals).toHaveLength(0);
  });

  it("no correlaciona un HelpRequest a más de 500m de cualquier incidente", async () => {
    findManyIncidents.mockResolvedValue([buildIncidentRow()] as never);
    findManyReports.mockResolvedValue([] as never);
    findManyHelpRequests.mockResolvedValue([buildHelpRequestRow()] as never);

    const result = await buildCanonicalIncidentPreview({ since, now, includeDemo: false, limit: 200 });

    expect(result.correlatedCitizenSignals).toHaveLength(0);
    expect(result.uncorrelatedCitizenSignals).toHaveLength(1);
    expect(result.uncorrelatedCitizenSignals[0].recordType).toBe("HelpRequest");
  });

  it("no correlaciona un Report cercano pero fuera de la ventana de 6h", async () => {
    findManyIncidents.mockResolvedValue([buildIncidentRow()] as never);
    findManyReports.mockResolvedValue([
      buildReportRow({ createdAt: new Date("2026-07-17T20:00:00.000Z") }),
    ] as never);
    findManyHelpRequests.mockResolvedValue([] as never);

    const result = await buildCanonicalIncidentPreview({ since, now, includeDemo: false, limit: 200 });

    expect(result.correlatedCitizenSignals).toHaveLength(0);
    expect(result.uncorrelatedCitizenSignals).toHaveLength(1);
  });

  it("excluye incidentes demo por defecto (includeDemo: false)", async () => {
    findManyIncidents.mockResolvedValue([
      buildIncidentRow({ id: "demo-1", tagsJson: ["seed"], sourceName: "Demo Feed" }),
    ] as never);
    findManyReports.mockResolvedValue([] as never);
    findManyHelpRequests.mockResolvedValue([] as never);

    const result = await buildCanonicalIncidentPreview({ since, now, includeDemo: false, limit: 200 });
    expect(result.incidents).toHaveLength(0);
  });

  it("usa DTOs de operador (no filas Prisma crudas) para las señales ciudadanas", async () => {
    findManyIncidents.mockResolvedValue([buildIncidentRow()] as never);
    findManyReports.mockResolvedValue([buildReportRow()] as never);
    findManyHelpRequests.mockResolvedValue([] as never);

    const result = await buildCanonicalIncidentPreview({ since, now, includeDemo: false, limit: 200 });
    const record = result.correlatedCitizenSignals[0].record as unknown as Record<string, unknown>;
    expect(record.author).toBe("vecino_123");
    expect(record.userId).toBe("user-1");
    expect(record.description).toBe("Se ve humo cerca del cerro");
  });
});
