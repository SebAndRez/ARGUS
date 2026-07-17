import { describe, expect, it } from "vitest";
import {
  createArgusMarkerHtml,
  getArgusMarkerColor,
  getArgusMarkerSeverityRank,
  getArgusMarkerSize,
  getArgusMarkerSizeRatio,
  normalizeArgusMapSeverity,
  type ArgusMapSeverity,
} from "@/lib/mapSymbols/argusMapSymbols";

/**
 * ARGUS Prompt 5 — regression suite for the single symbology source of
 * truth. Every runtime (2D Leaflet layers, Orbit) must resolve severity to
 * the same bucket and the same color/relative size through these functions
 * rather than a runtime-local table.
 */

const ALL_SEVERITIES: ArgusMapSeverity[] = [
  "inactive",
  "info",
  "low",
  "medium",
  "high",
  "critical",
];

describe("normalizeArgusMapSeverity", () => {
  it("maps known severities case-insensitively", () => {
    expect(normalizeArgusMapSeverity("CRITICAL")).toBe("critical");
    expect(normalizeArgusMapSeverity("High")).toBe("high");
    expect(normalizeArgusMapSeverity("medium")).toBe("medium");
    expect(normalizeArgusMapSeverity("Low")).toBe("low");
    expect(normalizeArgusMapSeverity("INACTIVE")).toBe("inactive");
  });

  it("falls back unknown/missing values to info, not low", () => {
    // Regression: GlobeView used to default unrecognized severities to
    // "low" (a reassuring green marker) while OperationalMap defaulted to
    // "info". An event with no severity signal is not the same thing as a
    // genuinely low-severity event, so both runtimes must agree on "info".
    expect(normalizeArgusMapSeverity(undefined)).toBe("info");
    expect(normalizeArgusMapSeverity(null)).toBe("info");
    expect(normalizeArgusMapSeverity("")).toBe("info");
    expect(normalizeArgusMapSeverity("unrecognized_value")).toBe("info");
  });
});

describe("getArgusMarkerSeverityRank", () => {
  it("orders severities by ascending importance", () => {
    const ranks = ALL_SEVERITIES.map((severity) => getArgusMarkerSeverityRank(severity));
    const sorted = [...ranks].sort((a, b) => a - b);
    expect(ranks).toEqual(sorted);
    expect(getArgusMarkerSeverityRank("critical")).toBeGreaterThan(
      getArgusMarkerSeverityRank("low")
    );
  });
});

describe("getArgusMarkerColor / getArgusMarkerSize / getArgusMarkerSizeRatio", () => {
  it("resolves a distinct color for every severity bucket", () => {
    const colors = new Set(ALL_SEVERITIES.map((severity) => getArgusMarkerColor(severity)));
    expect(colors.size).toBe(ALL_SEVERITIES.length);
  });

  it("keeps pixel size non-decreasing with severity rank", () => {
    const sizes = ALL_SEVERITIES.map((severity) => getArgusMarkerSize(severity));
    for (let index = 1; index < sizes.length; index += 1) {
      expect(sizes[index]).toBeGreaterThanOrEqual(sizes[index - 1]);
    }
  });

  it("anchors the size ratio at 1 for critical and derives others proportionally", () => {
    expect(getArgusMarkerSizeRatio("critical")).toBe(1);
    for (const severity of ALL_SEVERITIES) {
      const ratio = getArgusMarkerSizeRatio(severity);
      expect(ratio).toBeGreaterThan(0);
      expect(ratio).toBeLessThanOrEqual(1);
      expect(ratio).toBeCloseTo(getArgusMarkerSize(severity) / getArgusMarkerSize("critical"));
    }
  });

  it("is the only place a runtime should read severity color/size from (same input -> same output everywhere)", () => {
    // Simulates two independent call sites (e.g. a Leaflet layer and an
    // Orbit mesh factory) resolving the same canonical severity.
    const leafletColor = getArgusMarkerColor(normalizeArgusMapSeverity("HIGH"));
    const orbitColor = getArgusMarkerColor(normalizeArgusMapSeverity("high"));
    expect(leafletColor).toBe(orbitColor);
  });
});

describe("createArgusMarkerHtml sanitization", () => {
  it("escapes HTML in the title instead of injecting it raw", () => {
    const html = createArgusMarkerHtml({
      kind: "unknown",
      severity: "critical",
      confidence: "unknown",
      title: '<img src=x onerror=alert(1)>',
    });
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
});
