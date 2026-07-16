import { describe, expect, it } from "vitest";
import {
  generateOperationalHypothesis,
  type ArgusHypothesisLevel,
} from "@/lib/argus/operationalHypothesisEngine";
import type { ArgusCorrelatedIncident } from "@/types/correlation";
import type { ArgusNormalizedEvent } from "@/types/ingestion";

/**
 * ARGUS Prompt 20 — converted from
 * `src/lib/argus/__tests__/operationalHypothesisEngine.test.ts` (a
 * `runOperationalHypothesisEngineTest()` export Vitest never ran). Every
 * assertion below is preserved from the original.
 */

function event(overrides: Partial<ArgusNormalizedEvent>): ArgusNormalizedEvent {
  return {
    id: "event-test",
    sourceId: "usgs_earthquake",
    sourceName: "USGS",
    externalId: "external-test",
    title: "M 4.8 - 13 km E of Pianjiao, China",
    description: "USGS earthquake feed event.",
    category: "earthquake",
    severity: "medium",
    confidence: 82,
    latitude: 32.1,
    longitude: 104.2,
    occurredAt: "2026-07-05T00:00:00.000Z",
    isExternal: true,
    locationName: "13 km E of Pianjiao, China",
    ...overrides,
  };
}

function correlation(primaryEvent: ArgusNormalizedEvent): ArgusCorrelatedIncident {
  const gdacsEvent = event({
    id: "gdacs-test",
    sourceId: "gdacs",
    sourceName: "GDACS",
    externalId: "gdacs-test",
    title: "GDACS earthquake near Pianjiao",
    rawAlertLevel: "green",
  });

  return {
    id: "corr-test",
    title: "Possible same earthquake",
    kind: "same_event",
    primaryEvent,
    relatedEvents: [gdacsEvent],
    sourceIds: ["usgs_earthquake", "gdacs"],
    confidence: 94,
    severity: "medium",
    explanation: "USGS + GDACS possible same earthquake.",
    recommendedAction: "Monitor official updates.",
    createdAtLabel: "now",
  };
}

describe("generateOperationalHypothesis", () => {
  const usgsSingle = event({ rawMagnitude: 4.8, rawDepthKm: 10 });
  const usgsSingleHypothesis = generateOperationalHypothesis(usgsSingle);

  const usgsGdacsHypothesis = generateOperationalHypothesis(usgsSingle, {
    relatedSources: [correlation(usgsSingle)],
  });

  const noaaInfo = event({
    id: "noaa-info",
    sourceId: "noaa_tsunami",
    sourceName: "NOAA Tsunami",
    category: "tsunami",
    title: "Tsunami Information Statement",
    description: "NO tsunami danger from this earthquake.",
    rawMessageType: "INFORMATION",
  });
  const noaaInfoHypothesis = generateOperationalHypothesis(noaaInfo);

  const eonet = event({
    id: "eonet-test",
    sourceId: "nasa-eonet",
    sourceName: "NASA EONET",
    category: "storm",
    title: "Tropical Storm Douglas",
    description: "NASA EONET severe storm event.",
  });
  const eonetHypothesis = generateOperationalHypothesis(eonet);

  const contextual = event({
    id: "open-meteo-test",
    sourceId: "open-meteo",
    sourceName: "Open-Meteo",
    category: "weather_context",
    title: "Weather context",
    description: "Contextual weather reading.",
  });
  const contextualHypothesis = generateOperationalHypothesis(contextual);

  const insufficientHypothesis = generateOperationalHypothesis(null);

  it("a single USGS event yields a preliminary hypothesis", () => {
    const level: ArgusHypothesisLevel = "preliminary";
    expect(usgsSingleHypothesis.level).toBe(level);
  });

  it("the preliminary hypothesis summary mentions USGS", () => {
    expect(usgsSingleHypothesis.summary.includes("USGS")).toBe(true);
  });

  it("adding a GDACS correlation strengthens the hypothesis", () => {
    const level: ArgusHypothesisLevel = "strengthened";
    expect(usgsGdacsHypothesis.level).toBe(level);
  });

  it("the strengthened hypothesis summary mentions GDACS", () => {
    expect(usgsGdacsHypothesis.summary.includes("GDACS")).toBe(true);
  });

  it("a NOAA information-only tsunami statement yields controlled_negative", () => {
    const level: ArgusHypothesisLevel = "controlled_negative";
    expect(noaaInfoHypothesis.level).toBe(level);
  });

  it("the controlled_negative summary mentions 'sin amenaza tsunami'", () => {
    expect(noaaInfoHypothesis.summary.includes("sin amenaza tsunami")).toBe(true);
  });

  it("a NASA EONET storm event yields informational_context", () => {
    const level: ArgusHypothesisLevel = "informational_context";
    expect(eonetHypothesis.level).toBe(level);
  });

  it("the informational_context summary mentions NASA EONET", () => {
    expect(eonetHypothesis.summary.includes("NASA EONET")).toBe(true);
  });

  it("a pure weather-context reading also yields informational_context", () => {
    const level: ArgusHypothesisLevel = "informational_context";
    expect(contextualHypothesis.level).toBe(level);
  });

  it("the weather-context hypothesis has confidence <= 60", () => {
    expect(contextualHypothesis.confidence).toBeLessThanOrEqual(60);
  });

  it("no event at all yields insufficient_data", () => {
    const level: ArgusHypothesisLevel = "insufficient_data";
    expect(insufficientHypothesis.level).toBe(level);
  });

  it("the preliminary hypothesis lists missing evidence", () => {
    expect(usgsSingleHypothesis.missingEvidence.length).toBeGreaterThan(0);
  });

  it("the NOAA information-only hypothesis caveats mention 'autoridad competente'", () => {
    expect(noaaInfoHypothesis.caveats.some((caveat) => caveat.includes("autoridad competente"))).toBe(
      true,
    );
  });
});
