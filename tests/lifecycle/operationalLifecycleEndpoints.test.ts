import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArgusEvent } from "@/types/argusEvent";

/**
 * Regression suite for the Prompt 10 fix, at the endpoint level: each
 * affected route must apply the shared visibility policy, filter before
 * truncating to `limit` (never a partial page of stale-filtered results),
 * and leave its own geographic/severity/type filters and response contract
 * untouched. See docs/architecture/ARGUS_OPERATIONAL_LIFECYCLE_POLICY.md.
 *
 * Mocking strategy: only the I/O boundary of each route is mocked (Prisma,
 * the SENAPRED live adapter, the source cache, auth, USGS live fetch,
 * predictive packets) — the real route handlers, the real canonical mapper
 * (Prompt 9) and the real policy module (Prompt 10) all run unmocked. No
 * test reaches a real database or the network (global `fetch` is blocked by
 * tests/setup.ts regardless).
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    knowledgeIncident: { findMany: vi.fn() },
    externalEvent: { findMany: vi.fn() },
    report: { findMany: vi.fn() },
    helpRequest: { findMany: vi.fn() },
    ingestionRun: { findMany: vi.fn() },
    preparednessReminder: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/knowledge-intake/persistence/knowledgePersistenceService", () => ({
  getKnowledgeIncidents: vi.fn(),
}));

vi.mock("@/lib/ingestion/sourceCache", () => ({
  getCachedSource: vi.fn(() => null),
  setCachedSource: vi.fn(),
}));

vi.mock("@/lib/security/productionGuard", () => ({
  isDemoDataAllowed: vi.fn(() => false),
}));

vi.mock("@/services/authService", () => ({
  getCurrentUser: vi.fn(async () => null),
}));

vi.mock("@/lib/ingestion/ingestUsgsEarthquakes", () => ({
  getOrFetchUsgsEarthquakes: vi.fn(async () => ({ error: "mocked-off" })),
}));

vi.mock("@/lib/predictive-core/predictiveFeed", () => ({
  getPredictiveNotificationPackets: vi.fn(async () => []),
}));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getKnowledgeIncidents } from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import { isDemoDataAllowed } from "@/lib/security/productionGuard";
import { GET as vigiaEventsGet } from "@/app/api/vigia/events/route";
import { GET as chileAlertsGet } from "@/app/api/chile-alerts/route";
import { GET as argusEventsGet } from "@/app/api/argus/events/route";
import { GET as externalEventsGet } from "@/app/api/external-events/route";
import { GET as notificationsGet } from "@/app/api/notifications/route";
import type { CanonicalKnowledgeIncidentInput } from "@/lib/canonical/canonicalKnowledgeIncidentToArgusEvent";

const findManyKnowledgeMock = vi.mocked(prisma.knowledgeIncident.findMany);
const findManyExternalMock = vi.mocked(prisma.externalEvent.findMany);
const findManyReportMock = vi.mocked(prisma.report.findMany);
const findManyHelpRequestMock = vi.mocked(prisma.helpRequest.findMany);
const findManyIngestionRunMock = vi.mocked(prisma.ingestionRun.findMany);
const getKnowledgeIncidentsMock = vi.mocked(getKnowledgeIncidents);
const isDemoDataAllowedMock = vi.mocked(isDemoDataAllowed);

function buildIncidentRow(overrides: Partial<CanonicalKnowledgeIncidentInput> = {}): CanonicalKnowledgeIncidentInput {
  return {
    id: "row-1",
    externalId: "usgs-abc",
    sourceId: "usgs_earthquake",
    sourceName: "USGS Earthquake Hazards",
    domain: "earthquake",
    subtype: null,
    title: "M6.1 earthquake",
    summary: "Offshore earthquake",
    severity: "critical",
    confidenceScore: 90,
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
  findManyKnowledgeMock.mockReset().mockResolvedValue([]);
  findManyExternalMock.mockReset().mockResolvedValue([]);
  findManyReportMock.mockReset().mockResolvedValue([]);
  findManyHelpRequestMock.mockReset().mockResolvedValue([]);
  findManyIngestionRunMock.mockReset().mockResolvedValue([]);
  getKnowledgeIncidentsMock.mockReset().mockResolvedValue([]);
  isDemoDataAllowedMock.mockReset().mockReturnValue(false);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("/api/vigia/events", () => {
  it("excluye incidentes resueltos y archivados de la vista activa", async () => {
    findManyKnowledgeMock.mockResolvedValue([
      buildIncidentRow({ id: "active-1", technicalFactorsJson: { lifecycle: "active" } }),
      buildIncidentRow({ id: "resolved-1", technicalFactorsJson: { lifecycle: "resolved" } }),
      buildIncidentRow({ id: "archived-1", technicalFactorsJson: { lifecycle: "archived" } }),
    ] as never);

    const response = await vigiaEventsGet(new NextRequest("http://localhost/api/vigia/events"));
    const body = await response.json();

    expect(body.events.map((event: ArgusEvent) => event.id)).toEqual(["vigia-active-1"]);
  });

  it("Caso 13 — filtra antes de aplicar el límite: 3 activos + 2 resueltos con limit=2 devuelve 2 vigentes, no una página incompleta", async () => {
    findManyKnowledgeMock.mockResolvedValue([
      buildIncidentRow({ id: "resolved-a", technicalFactorsJson: { lifecycle: "resolved" } }),
      buildIncidentRow({ id: "resolved-b", technicalFactorsJson: { lifecycle: "resolved" } }),
      buildIncidentRow({ id: "active-a", technicalFactorsJson: { lifecycle: "active" } }),
      buildIncidentRow({ id: "active-b", technicalFactorsJson: { lifecycle: "active" } }),
      buildIncidentRow({ id: "active-c", technicalFactorsJson: { lifecycle: "active" } }),
    ] as never);

    const response = await vigiaEventsGet(new NextRequest("http://localhost/api/vigia/events?limit=2"));
    const body = await response.json();

    expect(body.events).toHaveLength(2);
    expect(body.events.every((event: ArgusEvent) => event.status === "active")).toBe(true);
  });

  it("preserva el filtro de severidad propio del endpoint", async () => {
    findManyKnowledgeMock.mockResolvedValue([
      buildIncidentRow({ id: "critical-1", severity: "critical", technicalFactorsJson: { lifecycle: "active" } }),
    ] as never);

    const response = await vigiaEventsGet(new NextRequest("http://localhost/api/vigia/events?severity=critical"));
    const body = await response.json();
    expect(body.events).toHaveLength(1);
    expect(body.events[0].severity).toBe("critical");
  });

  it("no realiza conexión de red real", async () => {
    findManyKnowledgeMock.mockResolvedValue([]);
    await vigiaEventsGet(new NextRequest("http://localhost/api/vigia/events"));
    expect(findManyKnowledgeMock).toHaveBeenCalledTimes(1);
  });
});

describe("/api/chile-alerts", () => {
  it("una alerta cancelada nunca vuelve a presentarse como vigente", async () => {
    getKnowledgeIncidentsMock.mockResolvedValue([
      buildIncidentRow({
        id: "chile-cancelled",
        sourceId: "senapred_eventos",
        sourceName: "SENAPRED Chile (alertas oficiales)",
        technicalFactorsJson: { region: "Valparaíso", lifecycle: "resolved" },
        tagsJson: ["senapred", "severe_weather", "lifecycle:cancelled"],
      }),
      buildIncidentRow({
        id: "chile-active",
        sourceId: "senapred_eventos",
        sourceName: "SENAPRED Chile (alertas oficiales)",
        technicalFactorsJson: { region: "Valparaíso", lifecycle: "active" },
        tagsJson: ["senapred", "severe_weather", "lifecycle:declared"],
      }),
    ] as never);

    const response = await chileAlertsGet(new NextRequest("http://localhost/api/chile-alerts"));
    const body = await response.json();

    expect(body.events.map((event: ArgusEvent) => event.id)).toEqual(["chile-alert-chile-active"]);
  });

  it("mantiene alertas en monitoreo", async () => {
    getKnowledgeIncidentsMock.mockResolvedValue([
      buildIncidentRow({
        id: "chile-monitoring",
        sourceId: "senapred_eventos",
        technicalFactorsJson: { region: "Valparaíso", lifecycle: "monitoring" },
        tagsJson: ["senapred", "lifecycle:maintained"],
      }),
    ] as never);

    const response = await chileAlertsGet(new NextRequest("http://localhost/api/chile-alerts"));
    const body = await response.json();
    expect(body.events).toHaveLength(1);
  });

  it("no realiza conexión real a Prisma (solo getKnowledgeIncidents mockeado)", async () => {
    getKnowledgeIncidentsMock.mockResolvedValue([]);
    await chileAlertsGet(new NextRequest("http://localhost/api/chile-alerts"));
    expect(findManyKnowledgeMock).not.toHaveBeenCalled();
  });
});

describe("/api/argus/events", () => {
  // Prompt 14 — este endpoint ya no hace fetch en vivo a SENAPRED
  // (fetchSenapredAlerts/correlateSignals); lee la misma persistencia
  // canónica que /api/chile-alerts (getKnowledgeIncidents + el mapeador
  // único), así que se prueba con el mismo tipo de fixture que esa suite.
  it("un origen ya resuelto no reaparece en la vista por defecto", async () => {
    getKnowledgeIncidentsMock.mockResolvedValue([
      buildIncidentRow({
        id: "e-active",
        sourceId: "senapred_eventos",
        sourceName: "SENAPRED Chile (alertas oficiales)",
        technicalFactorsJson: { region: "Valparaíso", lifecycle: "active" },
      }),
      buildIncidentRow({
        id: "e-resolved",
        sourceId: "senapred_eventos",
        sourceName: "SENAPRED Chile (alertas oficiales)",
        technicalFactorsJson: { region: "Valparaíso", lifecycle: "resolved" },
      }),
    ] as never);

    const response = await argusEventsGet(new NextRequest("http://localhost/api/argus/events"));
    const body = await response.json();

    expect(body.source).toBe("senapred_persisted");
    expect(body.events.map((event: ArgusEvent) => event.id)).toEqual(["chile-alert-e-active"]);
  });

  it("preserva la consulta histórica explícita ?status=resolved", async () => {
    getKnowledgeIncidentsMock.mockResolvedValue([
      buildIncidentRow({
        id: "e-active",
        sourceId: "senapred_eventos",
        technicalFactorsJson: { region: "Valparaíso", lifecycle: "active" },
      }),
      buildIncidentRow({
        id: "e-resolved",
        sourceId: "senapred_eventos",
        technicalFactorsJson: { region: "Valparaíso", lifecycle: "resolved" },
      }),
    ] as never);

    const response = await argusEventsGet(new NextRequest("http://localhost/api/argus/events?status=resolved"));
    const body = await response.json();

    expect(body.events.map((event: ArgusEvent) => event.id)).toEqual(["chile-alert-e-resolved"]);
  });

  it("una respuesta vacia valida (cero alertas vigentes) no dispara el fallback demo", async () => {
    getKnowledgeIncidentsMock.mockResolvedValue([]);

    const response = await argusEventsGet(new NextRequest("http://localhost/api/argus/events"));
    const body = await response.json();

    expect(body.source).toBe("senapred_persisted");
    expect(body.events).toEqual([]);
  });

  it("no realiza ninguna consulta en vivo a SENAPRED (solo Prisma mockeado)", async () => {
    getKnowledgeIncidentsMock.mockResolvedValue([]);
    await argusEventsGet(new NextRequest("http://localhost/api/argus/events"));
    expect(getKnowledgeIncidentsMock).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: "senapred_eventos" })
    );
  });
});

describe("/api/external-events", () => {
  it("Caso 7/8 — filtra expiresAt directamente en la consulta Prisma", async () => {
    findManyExternalMock.mockResolvedValue([]);
    await externalEventsGet(new NextRequest("http://localhost/api/external-events"));

    const queryArg = findManyExternalMock.mock.calls[0]?.[0] as { where: { OR?: unknown[] } };
    expect(queryArg.where.OR).toEqual([{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }]);
  });

  it("?includeExpired=true omite el filtro de vigencia (vista histórica preservada)", async () => {
    findManyExternalMock.mockResolvedValue([]);
    await externalEventsGet(new NextRequest("http://localhost/api/external-events?includeExpired=true"));

    const queryArg = findManyExternalMock.mock.calls[0]?.[0] as { where: { OR?: unknown[] } };
    expect(queryArg.where.OR).toBeUndefined();
  });
});

describe("/api/notifications", () => {
  it("Caso 14 — un KnowledgeIncident crítico resuelto no aumenta el contador crítico del resumen", async () => {
    findManyKnowledgeMock.mockResolvedValue([
      buildIncidentRow({
        id: "critical-resolved",
        severity: "critical",
        technicalFactorsJson: { lifecycle: "resolved" },
        tagsJson: [],
      }),
    ] as never);

    const response = await notificationsGet(new NextRequest("http://localhost/api/notifications"));
    const body = await response.json();

    expect(body.summary.critical).toBe(0);
  });

  it("un KnowledgeIncident crítico activo sí aumenta el contador crítico", async () => {
    findManyKnowledgeMock.mockResolvedValue([
      buildIncidentRow({
        id: "critical-active",
        severity: "critical",
        technicalFactorsJson: { lifecycle: "active" },
        tagsJson: [],
      }),
    ] as never);

    const response = await notificationsGet(new NextRequest("http://localhost/api/notifications"));
    const body = await response.json();

    expect(body.summary.critical).toBe(1);
  });

  it("filtra ExternalEvent vencidos directamente en la consulta Prisma", async () => {
    findManyExternalMock.mockResolvedValue([]);
    await notificationsGet(new NextRequest("http://localhost/api/notifications"));

    const queryArg = findManyExternalMock.mock.calls[0]?.[0] as { where?: { OR?: unknown[] } };
    expect(queryArg.where?.OR).toEqual([{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }]);
  });

  it("no realiza conexión de red real (USGS mockeado a error)", async () => {
    await notificationsGet(new NextRequest("http://localhost/api/notifications"));
    // Si el handler intentara un fetch() real no mockeado, tests/setup.ts lo haría fallar.
    expect(findManyReportMock).toHaveBeenCalled();
    expect(findManyHelpRequestMock).toHaveBeenCalled();
  });
});
