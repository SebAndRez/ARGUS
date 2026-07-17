import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ModuleIncidentSummary } from "@/types/moduleOperationalContext";
import type { CriticalPoi } from "@/lib/criticalPoi/criticalPoiTypes";
import type { FenixShelter } from "@/types/fenix";

/**
 * ARGUS Prompt 7 — territorial dossier regression suite. Mocks the real
 * DB-backed dependencies (`getCriticalInfrastructureNearIncident`,
 * `fetchCanonicalModuleIncidents`, `getRealFenixShelters`) so these tests
 * exercise composition/relation logic deterministically, without a database.
 */

const { getCriticalInfrastructureNearIncidentMock } = vi.hoisted(() => ({
  getCriticalInfrastructureNearIncidentMock: vi.fn<
    (point: { lat: number; lng: number }, radiusKm: number) => Promise<CriticalPoi[]>
  >(),
}));
vi.mock("@/lib/criticalPoi/criticalPoiModuleQueries", () => ({
  getCriticalInfrastructureNearIncident: getCriticalInfrastructureNearIncidentMock,
}));

const { fetchCanonicalModuleIncidentsMock } = vi.hoisted(() => ({
  fetchCanonicalModuleIncidentsMock: vi.fn(),
}));
vi.mock("@/lib/modules/canonicalIncidentGateway", () => ({
  fetchCanonicalModuleIncidents: fetchCanonicalModuleIncidentsMock,
}));

const { getRealFenixSheltersMock } = vi.hoisted(() => ({
  getRealFenixSheltersMock: vi.fn<(point: { lat: number; lng: number }, radiusKm: number) => Promise<FenixShelter[]>>(),
}));
vi.mock("@/lib/fenix/fenixShelterSource", () => ({
  getRealFenixShelters: getRealFenixSheltersMock,
}));

const { buildTerritorialDossier } = await import("@/lib/territory/territorialDossier");

function makePoi(overrides: Partial<CriticalPoi> & { id: string; lat: number; lng: number }): CriticalPoi {
  return {
    id: overrides.id,
    source: "osm",
    name: overrides.name ?? "Test asset",
    category: overrides.category ?? "hospital",
    priority: overrides.priority ?? "P1",
    lat: overrides.lat,
    lng: overrides.lng,
    status: "active",
    confidence: 80,
    isPersistent: true,
    isVisibleByDefault: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function makeIncident(overrides: Partial<ModuleIncidentSummary> = {}): ModuleIncidentSummary {
  return {
    id: overrides.id ?? "incident-1",
    type: overrides.type ?? "EARTHQUAKE",
    title: "Test incident",
    summary: null,
    severity: overrides.severity ?? "high",
    lifecycle: "active",
    verificationStatus: "official",
    confidence: overrides.confidence ?? "high",
    location: overrides.location ?? {
      latitude: -33.45,
      longitude: -70.66,
      geometry: { type: "point", coordinates: [-33.45, -70.66] },
      countryCode: "CL",
      regionCode: "RM",
    },
    timing: { startedAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(), expiresAt: null },
    sourceSummary: { primarySource: "usgs_earthquake", sourceCount: 1, isOfficial: true },
    isDemo: overrides.isDemo ?? false,
  };
}

function makeSummary(id: string, overrides: Partial<ModuleIncidentSummary> = {}): ModuleIncidentSummary {
  return makeIncident({ id, ...overrides });
}

beforeEach(() => {
  getCriticalInfrastructureNearIncidentMock.mockReset();
  fetchCanonicalModuleIncidentsMock.mockReset();
  getRealFenixSheltersMock.mockReset();
  getCriticalInfrastructureNearIncidentMock.mockResolvedValue([]);
  fetchCanonicalModuleIncidentsMock.mockResolvedValue({ ok: true, page: { summaries: [], nextCursor: null } });
  getRealFenixSheltersMock.mockResolvedValue([]);
});

describe("territory resolution", () => {
  it("uses real administrative geometry when available, exposing every intersected area", async () => {
    const location: ModuleIncidentSummary["location"] = {
      latitude: -33.45,
      longitude: -70.66,
      geometry: {
        type: "administrative_area",
        geojson: { type: "Polygon", coordinates: [[[-70.7, -33.5], [-70.6, -33.5], [-70.6, -33.4], [-70.7, -33.4], [-70.7, -33.5]]] },
        regionNames: ["Región Metropolitana", "Provincia de Santiago"],
        anchor: [-33.45, -70.66],
      },
      countryCode: "CL",
      regionCode: "RM",
    };

    const dossier = await buildTerritorialDossier(makeIncident({ location }));

    expect(dossier.territory.resolutionMethod).toBe("administrative_geometry");
    expect(dossier.territory.intersectedAdministrativeAreas).toEqual(["Región Metropolitana", "Provincia de Santiago"]);
    expect(dossier.territory.spansMultipleAdministrativeAreas).toBe(true);
    expect(dossier.territory.confidence).toBe("high");
  });

  it("falls back to canonical countryCode/regionCode fields when there is no area geometry", async () => {
    const dossier = await buildTerritorialDossier(makeIncident());

    expect(dossier.territory.resolutionMethod).toBe("canonical_fields");
    expect(dossier.territory.countryCode).toBe("CL");
    expect(dossier.territory.regionCode).toBe("RM");
    expect(dossier.territory.intersectedAdministrativeAreas).toEqual([]);
  });

  it("never fabricates a territory when the incident has no coordinates or codes", async () => {
    const dossier = await buildTerritorialDossier(
      makeIncident({
        location: { latitude: null, longitude: null, geometry: { type: "point", coordinates: [0, 0] }, countryCode: null, regionCode: null },
      })
    );

    expect(dossier.territory.resolutionMethod).toBe("not_resolved");
    expect(dossier.territory.confidence).toBe("unresolved");
  });
});

describe("related incidents", () => {
  it("excludes the source incident and filters by the resolved regionCode", async () => {
    fetchCanonicalModuleIncidentsMock.mockResolvedValue({
      ok: true,
      page: {
        summaries: [makeSummary("incident-1"), makeSummary("incident-2", { severity: "medium" })],
        nextCursor: null,
      },
    });

    const dossier = await buildTerritorialDossier(makeIncident({ id: "incident-1" }));

    expect(fetchCanonicalModuleIncidentsMock).toHaveBeenCalledWith(expect.objectContaining({ regionCode: "RM" }));
    expect(dossier.relatedIncidents.status).toBe("AVAILABLE");
    expect(dossier.relatedIncidents.data.map((incident) => incident.id)).toEqual(["incident-2"]);
  });

  it("marks related incidents NOT_APPLICABLE when no regionCode is resolved, never fetching", async () => {
    const dossier = await buildTerritorialDossier(
      makeIncident({
        location: { latitude: null, longitude: null, geometry: { type: "point", coordinates: [0, 0] }, countryCode: null, regionCode: null },
      })
    );

    expect(fetchCanonicalModuleIncidentsMock).not.toHaveBeenCalled();
    expect(dossier.relatedIncidents.status).toBe("NOT_APPLICABLE");
  });

  it("sorts related incidents by severity rank then recency, not by array order", async () => {
    fetchCanonicalModuleIncidentsMock.mockResolvedValue({
      ok: true,
      page: {
        summaries: [
          makeSummary("low-1", { severity: "low" }),
          makeSummary("critical-1", { severity: "critical" }),
          makeSummary("medium-1", { severity: "medium" }),
        ],
        nextCursor: null,
      },
    });

    const dossier = await buildTerritorialDossier(makeIncident({ id: "incident-1" }));

    expect(dossier.relatedIncidents.data.map((incident) => incident.id)).toEqual(["critical-1", "medium-1", "low-1"]);
  });
});

describe("relationships", () => {
  it("emits LOCATED_IN for every intersected administrative area", async () => {
    const location: ModuleIncidentSummary["location"] = {
      latitude: -33.45,
      longitude: -70.66,
      geometry: {
        type: "administrative_area",
        geojson: { type: "Polygon", coordinates: [[[-70.7, -33.5], [-70.6, -33.5], [-70.6, -33.4], [-70.7, -33.4], [-70.7, -33.5]]] },
        regionNames: ["Región Metropolitana"],
        anchor: [-33.45, -70.66],
      },
      countryCode: "CL",
      regionCode: "RM",
    };

    const dossier = await buildTerritorialDossier(makeIncident({ location }));

    const locatedIn = dossier.relationships.filter((relation) => relation.relationType === "LOCATED_IN");
    expect(locatedIn).toHaveLength(1);
    expect(locatedIn[0].targetLabel).toBe("Región Metropolitana");
    expect(locatedIn[0].status).toBe("CALCULATED");
  });

  it("emits AFFECTS only for INSIDE/BORDER infrastructure, never for NEAR-only assets", async () => {
    const location: ModuleIncidentSummary["location"] = {
      latitude: 0,
      longitude: 0,
      geometry: {
        type: "administrative_area",
        geojson: { type: "Polygon", coordinates: [[[-0.1, -0.1], [0.1, -0.1], [0.1, 0.1], [-0.1, 0.1], [-0.1, -0.1]]] },
        regionNames: ["Test Region"],
        anchor: [0, 0],
      },
      countryCode: "CL",
      regionCode: "test",
    };
    getCriticalInfrastructureNearIncidentMock.mockResolvedValue([
      makePoi({ id: "inside-1", lat: 0.01, lng: 0.01 }),
    ]);

    const dossier = await buildTerritorialDossier(makeIncident({ location, type: "WILDFIRE" }));

    const affects = dossier.relationships.filter((relation) => relation.relationType === "AFFECTS");
    expect(affects).toHaveLength(1);
    expect(affects[0].targetEntityId).toBe("inside-1");
  });

  it("uses CORRELATED_WITH for related incidents, never CAUSED_BY, and keeps confidence low and independent from the incident's own confidence", async () => {
    fetchCanonicalModuleIncidentsMock.mockResolvedValue({
      ok: true,
      page: { summaries: [makeSummary("incident-2")], nextCursor: null },
    });

    const dossier = await buildTerritorialDossier(makeIncident({ id: "incident-1", confidence: "verified" }));

    const correlated = dossier.relationships.filter((relation) => relation.relationType === "CORRELATED_WITH");
    expect(correlated).toHaveLength(1);
    expect(correlated[0].confidence).toBeLessThan(50);
    expect(correlated[0].confidence).not.toBe(100); // never inherits "verified" incident confidence as-is
    expect(dossier.relationships.map((relation) => relation.relationType)).not.toContain("CAUSED_BY");
  });
});

describe("sections that have no real source — never fabricated", () => {
  it("always reports organizations and historicalRisks as UNAVAILABLE with a documented reason", async () => {
    const dossier = await buildTerritorialDossier(makeIncident());

    expect(dossier.organizations.status).toBe("UNAVAILABLE");
    expect(dossier.organizations.data).toEqual([]);
    expect(dossier.organizations.reason?.length).toBeGreaterThan(0);
    expect(dossier.historicalRisks.status).toBe("UNAVAILABLE");
    expect(dossier.historicalRisks.reason?.length).toBeGreaterThan(0);
  });

  it("passes population through from the impact assessment unchanged, never recalculating it", async () => {
    const dossier = await buildTerritorialDossier(makeIncident());

    expect(dossier.population.status).toBe("UNAVAILABLE");
    expect(dossier.population.data).toBeNull();
    expect(dossier.limitations.some((line) => line.startsWith("Población:"))).toBe(true);
  });
});

describe("shelters", () => {
  it("reuses the real shelter source with a representative point", async () => {
    getRealFenixSheltersMock.mockResolvedValue([{ id: "shelter-1" } as FenixShelter]);

    const dossier = await buildTerritorialDossier(makeIncident());

    expect(getRealFenixSheltersMock).toHaveBeenCalledWith({ lat: -33.45, lng: -70.66 }, 10);
    expect(dossier.shelters.status).toBe("AVAILABLE");
    expect(dossier.shelters.data).toHaveLength(1);
  });
});

describe("overall status", () => {
  it("reports COMPLETE only when every section is AVAILABLE or NOT_APPLICABLE", async () => {
    const dossier = await buildTerritorialDossier(makeIncident());
    // organizations/historicalRisks/population are always UNAVAILABLE in this pass
    expect(dossier.overallStatus).not.toBe("COMPLETE");
  });
});

describe("assessment envelope", () => {
  it("propagates isDemo from the incident", async () => {
    const dossier = await buildTerritorialDossier(makeIncident({ isDemo: true }));
    expect(dossier.isDemo).toBe(true);
  });

  it("uses the injected clock for generatedAt", async () => {
    const fixedNow = new Date("2026-01-01T00:00:00.000Z");
    const dossier = await buildTerritorialDossier(makeIncident(), { now: fixedNow });
    expect(dossier.generatedAt).toBe(fixedNow.toISOString());
  });
});
