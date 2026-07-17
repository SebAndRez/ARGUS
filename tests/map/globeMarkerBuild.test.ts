import { describe, expect, it } from "vitest";
import { buildMarkers } from "@/components/map/GlobeView";
import { getArgusMarkerColor, normalizeArgusMapSeverity } from "@/lib/mapSymbols/argusMapSymbols";
import type { CrisisEvent } from "@/types/crisis";
import type { ArgusEvent } from "@/types/argusEvent";

/**
 * ARGUS Prompt 5 — Orbit must derive severity/color from the same canonical
 * source as the 2D map and must not truncate its entity limit by arrival
 * order. See docs/architecture/ARGUS_MAP_MODERNIZATION_IMPLEMENTATION.md §9/§11.
 */

function makeCrisisEvent(overrides: Partial<CrisisEvent> & { id: string }): CrisisEvent {
  return {
    id: overrides.id,
    title: overrides.title ?? "Test event",
    category: overrides.category ?? "general",
    description: "test",
    latitude: overrides.latitude ?? -33.45,
    longitude: overrides.longitude ?? -70.66,
    severity: overrides.severity ?? "LOW",
    type: overrides.type ?? "REPORT",
    status: overrides.status ?? "NEW",
    createdAt: overrides.createdAt ?? new Date(0).toISOString(),
    updatedAt: overrides.updatedAt,
  } as CrisisEvent;
}

function makeArgusEvent(
  overrides: Partial<ArgusEvent> & { id: string; latitude?: number; longitude?: number }
): ArgusEvent {
  const latitude = overrides.latitude ?? -33.45;
  const longitude = overrides.longitude ?? -70.66;
  return {
    id: overrides.id,
    title: overrides.title ?? "Argus event",
    country: "CL",
    eventType: overrides.eventType ?? "EARTHQUAKE",
    severity: overrides.severity ?? "low",
    status: "confirmed",
    confidence: "medium",
    sourceType: "official",
    sources: [],
    geometry: overrides.geometry ?? { type: "point", coordinates: [latitude, longitude] },
    geometryPrecision: "exact_point",
    detectedAt: overrides.detectedAt ?? new Date(0).toISOString(),
    lastUpdated: overrides.detectedAt ?? new Date(0).toISOString(),
    attribution: "Test",
    operationalSummary: "test",
  } as ArgusEvent;
}

describe("buildMarkers — severity parity between 2D and Orbit", () => {
  it("resolves the same severity bucket and color the 2D map would for the same raw value", () => {
    const event = makeCrisisEvent({ id: "crisis-1", severity: "HIGH" });
    const { markers } = buildMarkers([event], [], [], []);

    const orbitSeverity = markers[0].severity;
    const twoDSeverity = normalizeArgusMapSeverity(event.severity);

    expect(orbitSeverity).toBe(twoDSeverity);
    expect(getArgusMarkerColor(orbitSeverity)).toBe(getArgusMarkerColor(twoDSeverity));
  });

  it("does not diverge from the 2D fallback bucket for an unrecognized severity", () => {
    const event = makeCrisisEvent({ id: "crisis-2", severity: "weird_value" as never });
    const { markers } = buildMarkers([event], [], [], []);

    expect(markers[0].severity).toBe("info");
    expect(markers[0].severity).toBe(normalizeArgusMapSeverity(event.severity));
  });

  it("keeps canonical ArgusEvent severities distinct from a folded 4-bucket model", () => {
    const infoEvent = makeArgusEvent({ id: "argus-info", severity: "info" });
    const { markers } = buildMarkers([], [], [], [infoEvent]);
    // Previously Orbit only accepted "critical"/"high" ArgusEvents and had
    // no "info"/"inactive" buckets at all, so this would have been dropped
    // or miscolored as "low".
    expect(markers).toHaveLength(1);
    expect(markers[0].severity).toBe("info");
  });
});

describe("buildMarkers — explicit truncation policy", () => {
  it("prioritizes severity over arrival order when the entity limit is exceeded", () => {
    const lowEvents = Array.from({ length: 700 }, (_, index) =>
      makeCrisisEvent({
        id: `low-${index}`,
        severity: "LOW",
        latitude: -33 + index * 0.001,
        longitude: -70 + index * 0.001,
      })
    );
    const criticalEvents = Array.from({ length: 5 }, (_, index) =>
      makeCrisisEvent({
        id: `critical-${index}`,
        severity: "CRITICAL",
        latitude: -20 + index,
        longitude: -60 + index,
      })
    );

    const { markers, omittedCount } = buildMarkers(
      [...lowEvents, ...criticalEvents],
      [],
      [],
      []
    );

    expect(markers).toHaveLength(650);
    expect(omittedCount).toBe(55);
    const survivingIds = new Set(markers.map((marker) => marker.id));
    for (const critical of criticalEvents) {
      expect(survivingIds.has(critical.id)).toBe(true);
    }
  });

  it("breaks ties within the same severity by recency, not by array position", () => {
    const older = makeCrisisEvent({
      id: "older",
      severity: "MEDIUM",
      createdAt: new Date("2020-01-01T00:00:00Z").toISOString(),
    });
    const newer = makeCrisisEvent({
      id: "newer",
      severity: "MEDIUM",
      createdAt: new Date("2024-01-01T00:00:00Z").toISOString(),
    });

    const { markers } = buildMarkers([older, newer], [], [], []);

    expect(markers[0].id).toBe("newer");
    expect(markers[1].id).toBe("older");
  });
});
