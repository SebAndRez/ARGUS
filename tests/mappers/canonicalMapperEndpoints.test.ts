import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression suite for the Prompt 9 fix: `/api/vigia/events` and
 * `/api/chile-alerts` must both call the single canonical projection
 * (`canonicalKnowledgeIncidentToArgusEvent`) rather than their own
 * independent mapper implementations, while keeping their own
 * endpoint-specific filters (severity query param, archived-status
 * exclusion, `sourceId=senapred_eventos` scoping) outside the mapper.
 * See docs/architecture/ARGUS_CANONICAL_PROJECTION_IMPLEMENTATION.md.
 *
 * Mocking strategy: only the actual I/O boundary is mocked — Prisma
 * (`prisma.knowledgeIncident.findMany` for `/api/vigia/events`) and
 * `getKnowledgeIncidents` (for `/api/chile-alerts`) — so the real route
 * handlers, filters and the real canonical mapper all run unmocked. No test
 * in this file reaches a real database or the network (global `fetch` is
 * blocked by tests/setup.ts regardless).
 */

vi.mock("@/lib/prisma", () => ({
  prisma: { knowledgeIncident: { findMany: vi.fn() } },
}));

vi.mock("@/lib/knowledge-intake/persistence/knowledgePersistenceService", () => ({
  getKnowledgeIncidents: vi.fn(),
}));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getKnowledgeIncidents } from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import { GET as vigiaEventsGet } from "@/app/api/vigia/events/route";
import { GET as chileAlertsGet } from "@/app/api/chile-alerts/route";
import {
  canonicalKnowledgeIncidentToArgusEvent,
  type CanonicalKnowledgeIncidentInput,
} from "@/lib/canonical/canonicalKnowledgeIncidentToArgusEvent";

const findManyMock = vi.mocked(prisma.knowledgeIncident.findMany);
const getKnowledgeIncidentsMock = vi.mocked(getKnowledgeIncidents);

function buildRow(overrides: Partial<CanonicalKnowledgeIncidentInput> = {}): CanonicalKnowledgeIncidentInput {
  return {
    id: "row-1",
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
  getKnowledgeIncidentsMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("/api/vigia/events usa el mapeador canónico", () => {
  it("produce exactamente el mismo ArgusEvent que llamar al mapeador canónico directamente", async () => {
    const row = buildRow();
    findManyMock.mockResolvedValue([row] as never);

    const response = await vigiaEventsGet(new NextRequest("http://localhost/api/vigia/events"));
    const body = await response.json();

    const expected = canonicalKnowledgeIncidentToArgusEvent(row, { idPrefix: "vigia" });
    // `/api/vigia/events` enriquece con `recommendedModules` (ARGUS Fusion
    // Engine, `moduleActivationEngine.ts`) — no lo produce el mapeador puro.
    expect(body.events).toEqual([{ ...expected, recommendedModules: ["fenix", "hermes", "arca", "aura"] }]);
    expect(body.source).toBe("argus_global_watch");
  });

  it("no realiza ninguna llamada de red (fetch global bloqueado) ni consulta más de una vez", async () => {
    findManyMock.mockResolvedValue([]);
    await vigiaEventsGet(new NextRequest("http://localhost/api/vigia/events"));
    expect(findManyMock).toHaveBeenCalledTimes(1);
  });

  it("preserva el filtro propio de severidad del endpoint, fuera del mapeador", async () => {
    const row = buildRow({ id: "row-critical", severity: "critical", technicalFactorsJson: { lifecycle: "active" } });
    findManyMock.mockResolvedValue([row] as never);

    const response = await vigiaEventsGet(new NextRequest("http://localhost/api/vigia/events?severity=critical"));
    const body = await response.json();

    expect(body.events).toHaveLength(1);
    expect(body.events[0].severity).toBe("critical");
    const queryArg = findManyMock.mock.calls[0]?.[0] as { where: { severity?: string } };
    expect(queryArg.where.severity).toBe("critical");
  });

  it("preserva el filtro de eventos archivados, fuera del mapeador", async () => {
    const archivedRow = buildRow({ id: "row-archived", technicalFactorsJson: { lifecycle: "archived" } });
    findManyMock.mockResolvedValue([archivedRow] as never);

    const response = await vigiaEventsGet(new NextRequest("http://localhost/api/vigia/events"));
    const body = await response.json();
    expect(body.events).toHaveLength(0);
  });
});

describe("/api/chile-alerts usa el mapeador canónico", () => {
  it("produce exactamente el mismo ArgusEvent que llamar al mapeador canónico directamente", async () => {
    const row = buildRow({
      id: "chile-1",
      sourceId: "senapred_eventos",
      sourceName: "SENAPRED Chile (alertas oficiales)",
      technicalFactorsJson: { region: "Valparaíso", lifecycle: "active" },
      tagsJson: ["senapred", "severe_weather", "lifecycle:active"],
    });
    getKnowledgeIncidentsMock.mockResolvedValue([row] as never);

    const response = await chileAlertsGet(new NextRequest("http://localhost/api/chile-alerts"));
    const body = await response.json();

    const expected = canonicalKnowledgeIncidentToArgusEvent(row, { idPrefix: "chile-alert" });
    expect(body.events).toEqual([expected]);
    expect(body.source).toBe("senapred_eventos_persisted");
  });

  it("consulta getKnowledgeIncidents acotado a sourceId senapred_eventos, sin conexión real a Prisma", async () => {
    getKnowledgeIncidentsMock.mockResolvedValue([]);
    await chileAlertsGet(new NextRequest("http://localhost/api/chile-alerts"));
    expect(getKnowledgeIncidentsMock).toHaveBeenCalledWith(expect.objectContaining({ sourceId: "senapred_eventos" }));
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("preserva el filtro propio de severidad del endpoint, fuera del mapeador", async () => {
    const row = buildRow({ id: "chile-2", sourceId: "senapred_eventos", severity: "critical" });
    getKnowledgeIncidentsMock.mockResolvedValue([row] as never);

    const response = await chileAlertsGet(new NextRequest("http://localhost/api/chile-alerts?severity=high"));
    const body = await response.json();
    expect(body.events).toHaveLength(0);
  });
});
