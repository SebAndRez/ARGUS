import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ModuleIncidentSummary } from "@/types/moduleOperationalContext";
import type { CriticalPoi } from "@/lib/criticalPoi/criticalPoiTypes";
import type { FenixShelter } from "@/types/fenix";

/**
 * ARGUS Prompt 8 — end-to-end wiring test for `buildOperationalBriefing`:
 * incident → impact (Prompt 6) → territorial dossier (Prompt 7) → context →
 * deterministic briefing, with the three real DB-backed dependencies mocked.
 */

const { getCriticalInfrastructureNearIncidentMock } = vi.hoisted(() => ({
  getCriticalInfrastructureNearIncidentMock: vi.fn<
    (point: { lat: number; lng: number }, radiusKm: number) => Promise<CriticalPoi[]>
  >(),
}));
vi.mock("@/lib/criticalPoi/criticalPoiModuleQueries", () => ({
  getCriticalInfrastructureNearIncident: getCriticalInfrastructureNearIncidentMock,
}));

const { fetchCanonicalModuleIncidentsMock } = vi.hoisted(() => ({ fetchCanonicalModuleIncidentsMock: vi.fn() }));
vi.mock("@/lib/modules/canonicalIncidentGateway", () => ({
  fetchCanonicalModuleIncidents: fetchCanonicalModuleIncidentsMock,
}));

const { getRealFenixSheltersMock } = vi.hoisted(() => ({
  getRealFenixSheltersMock: vi.fn<(point: { lat: number; lng: number }, radiusKm: number) => Promise<FenixShelter[]>>(),
}));
vi.mock("@/lib/fenix/fenixShelterSource", () => ({ getRealFenixShelters: getRealFenixSheltersMock }));

const { buildOperationalBriefing } = await import("@/lib/briefing/operationalBriefing");
const { isGenerativeBriefingEnabled } = await import("@/lib/briefing/briefingLanguageProvider");

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

beforeEach(() => {
  getCriticalInfrastructureNearIncidentMock.mockReset().mockResolvedValue([]);
  fetchCanonicalModuleIncidentsMock.mockReset().mockResolvedValue({ ok: true, page: { summaries: [], nextCursor: null } });
  getRealFenixSheltersMock.mockReset().mockResolvedValue([]);
});

describe("buildOperationalBriefing — composition, never recalculation", () => {
  it("wires incident -> impact -> dossier -> context -> briefing end to end", async () => {
    const result = await buildOperationalBriefing(makeIncident());

    expect(result.context.incident.id).toBe("incident-1");
    expect(result.briefing.incidentId).toBe("incident-1");
    expect(result.briefing.status.severity).toBe("high");
    expect(result.briefing.status.confidence).toBe("high");
  });

  it("never invokes the generative provider — the feature flag is always false", async () => {
    // No env var set in the test environment; even if it were, the flag
    // hard-codes `&& false` (see briefingLanguageProvider.ts docstring).
    expect(isGenerativeBriefingEnabled()).toBe(false);
    const result = await buildOperationalBriefing(makeIncident());
    expect(result.generativeProviderStatus).toBe("PREPARADO_DESHABILITADO");
  });

  it("propagates real infrastructure from the impact assessment into the briefing's evidence trail", async () => {
    getCriticalInfrastructureNearIncidentMock.mockResolvedValue([
      {
        id: "hosp-1",
        source: "osm",
        name: "Hospital Test",
        category: "hospital",
        priority: "P1",
        lat: -33.451,
        lng: -70.661,
        status: "active",
        confidence: 80,
        isPersistent: true,
        isVisibleByDefault: true,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      },
    ]);

    const result = await buildOperationalBriefing(makeIncident());

    expect(result.briefing.evidence.citedIds).toContain("hosp-1");
    expect(result.briefing.impact.infrastructureAssets.some((asset) => asset.poiId === "hosp-1")).toBe(true);
  });

  it("produces the same contextHash for two builds of the same incident state, given the same injected clock", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const first = await buildOperationalBriefing(makeIncident(), { now });
    const second = await buildOperationalBriefing(makeIncident(), { now });

    expect(first.context.contextHash).toBe(second.context.contextHash);
  });

  it("reports material changes when a previous context with different severity is supplied", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const first = await buildOperationalBriefing(makeIncident({ severity: "medium" }), { now });
    const second = await buildOperationalBriefing(makeIncident({ severity: "critical" }), {
      now,
      previousContext: first.context,
    });

    expect(second.comparison.hasMaterialChanges).toBe(true);
    expect(second.comparison.entries.some((entry) => entry.field === "severity")).toBe(true);
  });

  it("uses the injected clock consistently across impact, dossier and briefing", async () => {
    const fixedNow = new Date("2026-01-01T00:00:00.000Z");
    const result = await buildOperationalBriefing(makeIncident(), { now: fixedNow });

    expect(result.context.generatedAt).toBe(fixedNow.toISOString());
    expect(result.briefing.generatedAt).toBe(fixedNow.toISOString());
  });
});
