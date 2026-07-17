import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ModuleIncidentSummary } from "@/types/moduleOperationalContext";
import type { CriticalPoi } from "@/lib/criticalPoi/criticalPoiTypes";

/**
 * ARGUS Prompt 6 — impact assessment regression suite. Mocks the one real
 * DB-backed dependency (`getCriticalInfrastructureNearIncident`) so these
 * tests exercise the geometry/priority/labeling logic deterministically,
 * without a database.
 */

const { getCriticalInfrastructureNearIncidentMock } = vi.hoisted(() => ({
  getCriticalInfrastructureNearIncidentMock: vi.fn<
    (point: { lat: number; lng: number }, radiusKm: number) => Promise<CriticalPoi[]>
  >(),
}));

vi.mock("@/lib/criticalPoi/criticalPoiModuleQueries", () => ({
  getCriticalInfrastructureNearIncident: getCriticalInfrastructureNearIncidentMock,
}));

const { buildIncidentImpactAssessment } = await import("@/lib/impact/incidentImpactAssessment");

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
      regionCode: null,
    },
    timing: { startedAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(), expiresAt: null },
    sourceSummary: { primarySource: "usgs_earthquake", sourceCount: 1, isOfficial: true },
    isDemo: overrides.isDemo ?? false,
  };
}

beforeEach(() => {
  getCriticalInfrastructureNearIncidentMock.mockReset();
});

describe("infrastructure exposure — point geometry", () => {
  it("classifies every found asset as NEAR, never INSIDE/BORDER, when the incident has no real area geometry", async () => {
    getCriticalInfrastructureNearIncidentMock.mockResolvedValue([
      makePoi({ id: "hosp-1", lat: -33.451, lng: -70.661, category: "hospital", priority: "P1" }),
    ]);

    const result = await buildIncidentImpactAssessment(makeIncident());

    expect(result.infrastructure.dataState).toBe("CALCULATED");
    expect(result.infrastructure.usedRealAreaGeometry).toBe(false);
    expect(result.infrastructure.assets).toHaveLength(1);
    expect(result.infrastructure.assets[0].spatialRelation).toBe("NEAR");
  });

  it("excludes assets the bbox prefilter returned but that are actually beyond the search radius", async () => {
    // Simulates a bbox-corner false positive: getCriticalPoisNear queries a
    // rectangle, not a true circle, so a real great-circle re-check can drop
    // a row the underlying query returned.
    getCriticalInfrastructureNearIncidentMock.mockResolvedValue([
      makePoi({ id: "far-1", lat: -33.9, lng: -71.3, category: "hospital", priority: "P1" }),
    ]);

    const result = await buildIncidentImpactAssessment(makeIncident());

    expect(result.infrastructure.assets).toHaveLength(0);
  });
});

describe("infrastructure exposure — real area geometry", () => {
  const squareAroundOrigin: ModuleIncidentSummary["location"] = {
    latitude: 0,
    longitude: 0,
    geometry: {
      type: "administrative_area",
      geojson: {
        type: "Polygon",
        coordinates: [
          [
            [-0.1, -0.1],
            [0.1, -0.1],
            [0.1, 0.1],
            [-0.1, 0.1],
            [-0.1, -0.1],
          ],
        ],
      },
      regionNames: ["Test Region"],
      anchor: [0, 0],
    },
    countryCode: "CL",
    regionCode: "test",
  };

  it("classifies an asset inside the real polygon as INSIDE, not just NEAR", async () => {
    getCriticalInfrastructureNearIncidentMock.mockResolvedValue([
      makePoi({ id: "inside-1", lat: 0.01, lng: 0.01 }),
    ]);

    const result = await buildIncidentImpactAssessment(
      makeIncident({ location: squareAroundOrigin, type: "WILDFIRE" })
    );

    expect(result.infrastructure.usedRealAreaGeometry).toBe(true);
    expect(result.infrastructure.assets[0].spatialRelation).toBe("INSIDE");
    expect(result.infrastructure.assets[0].distanceKm).toBe(0);
  });

  it("classifies an asset well outside the polygon and outside the search radius as excluded (OUTSIDE)", async () => {
    getCriticalInfrastructureNearIncidentMock.mockResolvedValue([
      makePoi({ id: "outside-1", lat: 5, lng: 5 }),
    ]);

    const result = await buildIncidentImpactAssessment(
      makeIncident({ location: squareAroundOrigin, type: "WILDFIRE" })
    );

    expect(result.infrastructure.assets).toHaveLength(0);
  });
});

describe("population / routes / services — never fabricated", () => {
  it("always reports population exposure as NOT_AVAILABLE with a documented reason, never a number", async () => {
    getCriticalInfrastructureNearIncidentMock.mockResolvedValue([]);
    const result = await buildIncidentImpactAssessment(makeIncident());

    expect(result.population.dataState).toBe("NOT_AVAILABLE");
    expect(result.population.estimatedRangeLow).toBeNull();
    expect(result.population.estimatedRangeHigh).toBeNull();
    expect(result.population.reason.length).toBeGreaterThan(0);
    expect(result.limitations.some((line) => line.includes("Población expuesta"))).toBe(true);
  });

  it("always reports routes and services as NOT_AVAILABLE with documented reasons", async () => {
    getCriticalInfrastructureNearIncidentMock.mockResolvedValue([]);
    const result = await buildIncidentImpactAssessment(makeIncident());

    expect(result.routes.dataState).toBe("NOT_AVAILABLE");
    expect(result.services.dataState).toBe("NOT_AVAILABLE");
  });
});

describe("operational priority", () => {
  it("does not zero out a high-severity incident just because confidence is low", async () => {
    getCriticalInfrastructureNearIncidentMock.mockResolvedValue([]);
    const result = await buildIncidentImpactAssessment(
      makeIncident({ severity: "critical", confidence: "low" })
    );

    // severity contributes 100*0.5 = 50 on its own, floor of "medium" (25) regardless of confidence/exposure
    expect(result.priority.score).toBeGreaterThanOrEqual(50);
    expect(result.priority.level).not.toBe("low");
  });

  it("raises priority when real infrastructure is found inside the incident area", async () => {
    // A point-only incident can never produce INSIDE/BORDER assets (only
    // NEAR), so the exposure component of priority requires real area
    // geometry to be meaningfully exercised here.
    const areaLocation: ModuleIncidentSummary["location"] = {
      latitude: -33.45,
      longitude: -70.66,
      geometry: {
        type: "administrative_area",
        geojson: {
          type: "Polygon",
          coordinates: [
            [
              [-70.76, -33.55],
              [-70.56, -33.55],
              [-70.56, -33.35],
              [-70.76, -33.35],
              [-70.76, -33.55],
            ],
          ],
        },
        regionNames: ["Test Region"],
        anchor: [-33.45, -70.66],
      },
      countryCode: "CL",
      regionCode: null,
    };

    getCriticalInfrastructureNearIncidentMock
      .mockResolvedValueOnce([]) // baseline call
      .mockResolvedValueOnce(
        Array.from({ length: 5 }, (_, index) => makePoi({ id: `p${index}`, lat: -33.45, lng: -70.66 }))
      );

    const baseline = await buildIncidentImpactAssessment(
      makeIncident({ severity: "medium", confidence: "medium", location: areaLocation })
    );
    const withInfrastructure = await buildIncidentImpactAssessment(
      makeIncident({ severity: "medium", confidence: "medium", location: areaLocation })
    );

    expect(withInfrastructure.priority.score).toBeGreaterThan(baseline.priority.score);
  });
});

describe("suggested actions", () => {
  it("suggests escalation only for high/critical priority, not for low/medium", async () => {
    getCriticalInfrastructureNearIncidentMock.mockResolvedValue([]);
    const low = await buildIncidentImpactAssessment(makeIncident({ severity: "info", confidence: "low" }));
    expect(low.suggestedActions.some((action) => action.action.includes("Escalar"))).toBe(false);

    const critical = await buildIncidentImpactAssessment(makeIncident({ severity: "critical", confidence: "verified" }));
    expect(critical.suggestedActions.some((action) => action.action.includes("Escalar"))).toBe(true);
  });

  it("never issues an action as a direct order — every action is SUGGESTED or PENDING_VALIDATION", async () => {
    getCriticalInfrastructureNearIncidentMock.mockResolvedValue([
      makePoi({ id: "h1", lat: -33.451, lng: -70.661 }),
    ]);
    const result = await buildIncidentImpactAssessment(makeIncident());

    expect(result.suggestedActions.length).toBeGreaterThan(0);
    for (const action of result.suggestedActions) {
      expect(["SUGGESTED", "PENDING_VALIDATION"]).toContain(action.status);
    }
  });
});

describe("assessment envelope", () => {
  it("never recomputes severity/confidence — passes the incident's own values through unchanged", async () => {
    getCriticalInfrastructureNearIncidentMock.mockResolvedValue([]);
    const incident = makeIncident({ severity: "medium", confidence: "medium_high" });
    const result = await buildIncidentImpactAssessment(incident);

    expect(result.incidentSeverity).toBe("medium");
    expect(result.incidentConfidence).toBe("medium_high");
    expect(result.incidentId).toBe(incident.id);
  });

  it("propagates isDemo from the incident, never inferring it independently", async () => {
    getCriticalInfrastructureNearIncidentMock.mockResolvedValue([]);
    const demoResult = await buildIncidentImpactAssessment(makeIncident({ isDemo: true }));
    const realResult = await buildIncidentImpactAssessment(makeIncident({ isDemo: false }));

    expect(demoResult.isDemo).toBe(true);
    expect(realResult.isDemo).toBe(false);
  });

  it("uses the injected clock for generatedAt instead of the ambient clock", async () => {
    getCriticalInfrastructureNearIncidentMock.mockResolvedValue([]);
    const fixedNow = new Date("2026-01-01T00:00:00.000Z");
    const result = await buildIncidentImpactAssessment(makeIncident(), { now: fixedNow });

    expect(result.generatedAt).toBe(fixedNow.toISOString());
  });
});
