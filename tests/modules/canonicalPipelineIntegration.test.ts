import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Closure of "Cerrar y Unificar" (2026-09-21): the module dashboards consume
 * the real pipeline — canonical incidents → TALOS → HERMES, real shelters →
 * ARCA, real context → FÉNIX — and never fall back to demo data unless the
 * server says demo data is allowed. Only I/O boundaries are mocked.
 */

vi.mock("@/lib/routing/routingService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/routing/routingService")>();
  return { ...actual, calculateRoutes: vi.fn() };
});

import {
  canonicalIncidentToCrisisEvent,
  canonicalIncidentsToCrisisEvents,
  isCanonicalCrisisEvent,
} from "@/lib/modules/canonicalCrisisEvent";
import { loadOperationalEvents } from "@/lib/modules/loadOperationalEvents";
import { assessTalosEvents } from "@/modules/talos/talosLiveAssessments";
import { convertTalosAssessmentsToHermesRiskZones } from "@/modules/hermes/hermesTalosBridge";
import { calculateHermesRoutes } from "@/modules/hermes/hermesRouting";
import { calculateRoutes } from "@/lib/routing/routingService";
import { fenixShelterToArcaShelter } from "@/modules/arca/arcaRealShelters";
import { convertCanonicalEventToOraculoEvidence } from "@/modules/oraculo/oraculoEvidence";
import { runFenixSimulation } from "@/lib/fenix/fenixSimulationEngine";
import type { ModuleIncidentSummary } from "@/types/moduleOperationalContext";
import type { FenixShelter } from "@/types/fenix";

const calculateRoutesMock = vi.mocked(calculateRoutes);

function summary(overrides: Partial<ModuleIncidentSummary> = {}): ModuleIncidentSummary {
  return {
    id: "ki-1",
    type: "WILDFIRE",
    title: "Incendio forestal en Quilpué",
    summary: "Foco activo con viento hacia zona poblada.",
    severity: "critical",
    lifecycle: "active",
    verificationStatus: "official",
    confidence: "high",
    location: { latitude: -33.05, longitude: -71.44, geometry: null as never, countryCode: "CL", regionCode: "CL-VS" },
    timing: { startedAt: "2026-09-21T10:00:00.000Z", updatedAt: "2026-09-21T11:00:00.000Z", expiresAt: null },
    sourceSummary: { primarySource: "senapred", sourceCount: 2, isOfficial: true },
    isDemo: false,
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("canonicalIncidentToCrisisEvent", () => {
  it("maps severity, category, lifecycle and verification without inventing data", () => {
    const event = canonicalIncidentToCrisisEvent(summary())!;
    expect(event.id).toBe("canonical:ki-1");
    expect(isCanonicalCrisisEvent(event)).toBe(true);
    expect(event.severity).toBe("CRITICAL");
    expect(event.category).toBe("incendio");
    expect(event.status).toBe("VALIDATED");
    expect(event.type).toBe("ALERT");
    expect(event.sourceCategory).toBe("official");
    expect(event.createdAt).toBe("2026-09-21T10:00:00.000Z");
  });

  it("marks closed lifecycles RESOLVED and unverified ones NEW, and never promotes `info`", () => {
    expect(canonicalIncidentToCrisisEvent(summary({ lifecycle: "resolved" }))!.status).toBe("RESOLVED");
    expect(canonicalIncidentToCrisisEvent(summary({ verificationStatus: "unverified" }))!.status).toBe("NEW");
    expect(canonicalIncidentToCrisisEvent(summary({ severity: "info" }))!.severity).toBe("LOW");
  });

  it("drops incidents without a point location instead of inventing coordinates", () => {
    const noPoint = summary({ location: { latitude: null, longitude: null, geometry: null as never, countryCode: "CL", regionCode: null } });
    expect(canonicalIncidentToCrisisEvent(noPoint)).toBeNull();
    expect(canonicalIncidentsToCrisisEvents([noPoint, summary({ id: "ki-2" })])).toHaveLength(1);
  });
});

describe("loadOperationalEvents", () => {
  function stubFetch(responses: { events?: unknown; canonical?: unknown; eventsOk?: boolean }) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.startsWith("/api/events")) {
          return { ok: responses.eventsOk ?? true, json: async () => responses.events };
        }
        return { ok: true, json: async () => responses.canonical };
      })
    );
  }

  it("merges canonical incidents with citizen reports and carries the server demo flag", async () => {
    stubFetch({
      events: { events: [{ id: "r1", type: "REPORT", status: "NEW" }], demoFallbackAllowed: true },
      canonical: { state: "available", data: { summaries: [summary()], nextCursor: null } },
    });
    const loaded = await loadOperationalEvents("argus-talos");
    expect(loaded.canonical.map((event) => event.id)).toEqual(["canonical:ki-1"]);
    expect(loaded.events).toHaveLength(2);
    expect(loaded.demoFallbackAllowed).toBe(true);
    expect(loaded.canonicalState).toBe("available");
  });

  it("fails closed: no demo permission when the flag is missing or /api/events fails", async () => {
    stubFetch({ events: { events: [] }, canonical: { state: "empty", data: { summaries: [], nextCursor: null } } });
    expect((await loadOperationalEvents("argus-atlas")).demoFallbackAllowed).toBe(false);

    stubFetch({ eventsOk: false, events: { demoFallbackAllowed: true }, canonical: { state: "unauthorized", error: { code: "FORBIDDEN", message: "x" } } });
    const failed = await loadOperationalEvents("argus-atlas");
    expect(failed.demoFallbackAllowed).toBe(false);
    expect(failed.canonical).toEqual([]);
  });
});

describe("TALOS → HERMES", () => {
  it("HERMES risk zones come from the live TALOS assessments of canonical incidents", () => {
    const events = canonicalIncidentsToCrisisEvents([summary()]);
    const assessments = assessTalosEvents(events);
    expect(assessments).toHaveLength(1);
    const zones = convertTalosAssessmentsToHermesRiskZones(assessments);
    expect(zones.length).toBeGreaterThan(0);
    expect(zones[0]!.center.lat).toBeCloseTo(-33.05);
  });

  it("uses real street geometry when the provider answers (isDemo false)", async () => {
    calculateRoutesMock.mockResolvedValue([
      {
        id: "fastest-osrm-0",
        title: "Mas rapida",
        geometry: [
          [-33.05, -71.44],
          [-33.06, -71.45],
        ],
        distanceKm: 1.6,
        durationMin: 4,
        provider: "osrm",
        isDemo: false,
        mode: "vehicle",
      },
    ]);
    const routes = await calculateHermesRoutes({
      origin: { lat: -33.05, lng: -71.44 },
      destination: { lat: -33.06, lng: -71.45 },
      mobilityMode: "car",
      purpose: "evacuation",
    });
    expect(routes).toHaveLength(1);
    expect(routes[0]!.isDemo).toBe(false);
    expect(routes[0]!.distanceMeters).toBe(1600);
    expect(calculateRoutesMock).toHaveBeenCalledWith(expect.objectContaining({ mode: "vehicle" }));
  });

  it("falls back to the simulated engine, labelled demo, when only the straight-line fallback exists", async () => {
    calculateRoutesMock.mockResolvedValue([
      { geometry: [[-33.05, -71.44], [-33.06, -71.45]], distanceKm: 1, durationMin: 3, provider: "fallback_straight_line", isDemo: true, mode: "vehicle" },
    ]);
    const routes = await calculateHermesRoutes({
      origin: { lat: -33.05, lng: -71.44 },
      destination: { lat: -33.06, lng: -71.45 },
      mobilityMode: "car",
      purpose: "safe_navigation",
    });
    expect(routes.length).toBeGreaterThan(0);
    expect(routes.every((route) => route.isDemo === true)).toBe(true);
  });

  it("never asks the street router for modes without real routing (drone/boat)", async () => {
    await calculateHermesRoutes({
      origin: { lat: -33.05, lng: -71.44 },
      destination: { lat: -33.06, lng: -71.45 },
      mobilityMode: "drone_future",
      purpose: "reconnaissance",
    });
    expect(calculateRoutesMock).not.toHaveBeenCalled();
  });
});

describe("ARCA real shelters", () => {
  const realShelter: FenixShelter = {
    id: "poi-1",
    name: "Liceo Municipal",
    status: "near_capacity",
    coordinates: [-33.44, -70.65],
    capacity: 200,
    currentOccupancy: 150,
    waterAvailable: true,
    hasFood: false,
    operatorName: "Municipalidad",
    contactPhone: "+56 9 1234 5678",
    confidence: 70,
    lastVerifiedAt: "2026-09-21T09:00:00.000Z",
    locationAccuracy: "precise",
  } as FenixShelter;

  it("maps the FÉNIX/CriticalPoi shelter without inventing capacity or services", () => {
    const shelter = fenixShelterToArcaShelter(realShelter);
    expect(shelter.isDemo).toBe(false);
    expect(shelter.status).toBe("limited");
    expect(shelter.capacity.available).toBe(50);
    expect(shelter.services.water).toBe("available");
    expect(shelter.services.food).toBe("unavailable");
    expect(shelter.services.showers).toBe("unknown");
    expect(shelter.confidence).toBe("high");
  });

  it("does not surface operator contact details", () => {
    expect(JSON.stringify(fenixShelterToArcaShelter(realShelter))).not.toContain("1234");
  });
});

describe("ORÁCULO canonical evidence", () => {
  it("treats official canonical incidents as official evidence, not citizen reports", () => {
    const evidence = convertCanonicalEventToOraculoEvidence(canonicalIncidentToCrisisEvent(summary())!)!;
    expect(evidence.sourceType).toBe("official");
    expect(evidence.category).toBe("wildfire");
    expect(evidence.verificationStatus).toBe("verified");
    expect(evidence.isDemo).toBe(false);
  });

  it("ignores resolved incidents", () => {
    expect(convertCanonicalEventToOraculoEvidence(canonicalIncidentToCrisisEvent(summary({ lifecycle: "archived" }))!)).toBeNull();
  });
});

describe("FÉNIX real context", () => {
  it("uses injected real shelters, medical points and report count instead of scenario demo data", () => {
    const result = runFenixSimulation({
      scenarioId: "fenix-wildfire-urban-edge",
      initialLocation: { latitude: -33.44, longitude: -70.65 },
      realContext: {
        shelters: [{ id: "poi-1", name: "Liceo Municipal", status: "available", coordinates: [-33.44, -70.65] } as FenixShelter],
        medicalPoints: [{ id: "h-1", name: "Hospital Real", distanceKm: 1.2 }],
        relatedReportsCount: 4,
      },
    });
    expect(result.shelters.map((shelter: { id: string }) => shelter.id)).toEqual(["poi-1"]);
    expect(result.medicalPoints).toEqual([{ id: "h-1", name: "Hospital Real", distanceKm: 1.2, isDemo: false }]);
    expect(result.reportDensity.relatedReports).toBe(4);
    expect(result.reportDensity.isDemo).toBe(false);
  });

  it("keeps the labelled scenario fallback only for parts without real data", () => {
    const result = runFenixSimulation({ scenarioId: "fenix-wildfire-urban-edge" });
    expect(result.reportDensity.isDemo).toBe(true);
  });
});
