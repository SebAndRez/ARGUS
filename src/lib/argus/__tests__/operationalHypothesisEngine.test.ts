import {
  generateOperationalHypothesis,
  type ArgusHypothesisLevel,
} from "@/lib/argus/operationalHypothesisEngine";
import type { ArgusCorrelatedIncident } from "@/types/correlation";
import type { ArgusNormalizedEvent } from "@/types/ingestion";

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

function expectLevel(level: ArgusHypothesisLevel, actual: ArgusHypothesisLevel) {
  return actual === level;
}

export function runOperationalHypothesisEngineTest() {
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

  return {
    passed:
      expectLevel("preliminary", usgsSingleHypothesis.level) &&
      usgsSingleHypothesis.summary.includes("USGS") &&
      expectLevel("strengthened", usgsGdacsHypothesis.level) &&
      usgsGdacsHypothesis.summary.includes("GDACS") &&
      expectLevel("controlled_negative", noaaInfoHypothesis.level) &&
      noaaInfoHypothesis.summary.includes("sin amenaza tsunami") &&
      expectLevel("informational_context", eonetHypothesis.level) &&
      eonetHypothesis.summary.includes("NASA EONET") &&
      expectLevel("informational_context", contextualHypothesis.level) &&
      contextualHypothesis.confidence <= 60 &&
      expectLevel("insufficient_data", insufficientHypothesis.level) &&
      usgsSingleHypothesis.missingEvidence.length > 0 &&
      noaaInfoHypothesis.caveats.some((caveat) => caveat.includes("autoridad competente")),
    examples: {
      usgsSingleHypothesis,
      usgsGdacsHypothesis,
      noaaInfoHypothesis,
      eonetHypothesis,
      contextualHypothesis,
      insufficientHypothesis,
    },
  };
}
