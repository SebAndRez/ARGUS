import { beforeAll, describe, expect, it } from "vitest";
import {
  buildCoopsCoastalObservationContext,
  buildCoopsEvidence,
  getCoopsAdapterStatus,
  normalizeCoopsProduct,
  normalizeCoopsStation,
  validateNoaaCoopsRequest,
} from "@/lib/knowledge-intake/adapters/noaaCoopsAdapter";
import { buildNoaaCoopsCoastalRiskContext } from "@/lib/risk/noaaCoopsCoastalRiskContext";
import { buildNoaaCoopsFenixContext } from "@/lib/fenix/noaaCoopsFenixContext";
import { buildNoaaCoopsRouteContext } from "@/lib/nav/noaaCoopsRouteContext";
import { buildNoaaCoopsMedicalContext } from "@/lib/aura/noaaCoopsMedicalContext";

/**
 * ARGUS Prompt 20 — converted from
 * `src/lib/knowledge-intake/__tests__/noaaCoopsAdapter.test.ts` (a
 * `runNoaaCoopsAdapterTest()` export Vitest never ran). The observation
 * context builder is async, so shared fixtures are computed once in
 * `beforeAll` — every assertion below is preserved as-is from the original
 * `passed:` chain.
 */

const sampleStation = {
  id: "9414290",
  name: "San Francisco",
  lat: "37.8063",
  lng: "-122.4659",
  state: "CA",
  timezone: "PST",
};

const sampleWaterLevel = {
  data: [{ t: new Date().toISOString(), v: "1.23", f: "0,0,0,0", q: "p" }],
};

const samplePredictions = {
  predictions: [
    { t: new Date(Date.now() + 60 * 60_000).toISOString(), v: "1.8", type: "H" },
    { t: new Date(Date.now() + 7 * 60 * 60_000).toISOString(), v: "0.2", type: "L" },
  ],
};

// validateNoaaCoopsRequest returns a discriminated union (`valid: true` with
// `params`, or `valid: false` with `message`). The original file accessed
// `.message`/`.params` inline within the same `&&` chain that also checked
// `.valid`, which TS narrows automatically; splitting each condition into
// its own `it()` loses that inline narrowing, so these two tiny helpers
// restore it without altering any tested value.
function asInvalid(result: ReturnType<typeof validateNoaaCoopsRequest>) {
  if (result.valid) throw new Error("expected an invalid validation result");
  return result;
}
function asValid(result: ReturnType<typeof validateNoaaCoopsRequest>) {
  if (!result.valid) throw new Error("expected a valid validation result");
  return result;
}

describe("NOAA CO-OPS coastal observation adapter", () => {
  let missingFilter: ReturnType<typeof validateNoaaCoopsRequest>;
  let invalidLat: ReturnType<typeof validateNoaaCoopsRequest>;
  let invalidLon: ReturnType<typeof validateNoaaCoopsRequest>;
  let invalidBbox: ReturnType<typeof validateNoaaCoopsRequest>;
  let invalidUnits: ReturnType<typeof validateNoaaCoopsRequest>;
  let valid: ReturnType<typeof validateNoaaCoopsRequest>;
  let station: ReturnType<typeof normalizeCoopsStation>;
  let waterLevel: ReturnType<typeof normalizeCoopsProduct>;
  let predictions: ReturnType<typeof normalizeCoopsProduct>;
  let context: Awaited<ReturnType<typeof buildCoopsCoastalObservationContext>>;
  let evidence: ReturnType<typeof buildCoopsEvidence>;
  let status: ReturnType<typeof getCoopsAdapterStatus>;
  let risk: ReturnType<typeof buildNoaaCoopsCoastalRiskContext>;
  let fenix: ReturnType<typeof buildNoaaCoopsFenixContext>;
  let nav: ReturnType<typeof buildNoaaCoopsRouteContext>;
  let aura: ReturnType<typeof buildNoaaCoopsMedicalContext>;

  beforeAll(async () => {
    missingFilter = validateNoaaCoopsRequest({});
    invalidLat = validateNoaaCoopsRequest({ lat: 91, lon: 0 });
    invalidLon = validateNoaaCoopsRequest({ lat: 0, lon: -181 });
    invalidBbox = validateNoaaCoopsRequest({ bbox: "10,10,0,0" });
    invalidUnits = validateNoaaCoopsRequest({ stationId: "9414290", units: "kelvin" });
    valid = validateNoaaCoopsRequest({
      stationId: "9414290",
      products: ["water_level", "predictions", "wind", "air_pressure", "air_gap"],
      radiusKm: 99,
    });
    station = normalizeCoopsStation(sampleStation, { lat: 37.8, lon: -122.4 });
    waterLevel = normalizeCoopsProduct("water_level", sampleWaterLevel, {
      stationId: "9414290",
      datum: "MLLW",
      units: "metric",
    });
    predictions = normalizeCoopsProduct("predictions", samplePredictions, {
      stationId: "9414290",
      datum: "MLLW",
      units: "metric",
    });
    context = await buildCoopsCoastalObservationContext(
      { stationId: "9414290", purpose: "coastal_monitoring", products: ["water_level", "predictions"], datum: "MLLW", includeMetadata: false },
      [
        {
          product: "water_level",
          response: sampleWaterLevel,
          endpoint: "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?station=9414290&product=water_level",
        },
        {
          product: "predictions",
          response: samplePredictions,
          endpoint: "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?station=9414290&product=predictions",
        },
      ]
    );
    evidence = buildCoopsEvidence(context, { incidentId: "incident-1" });
    status = getCoopsAdapterStatus();
    risk = buildNoaaCoopsCoastalRiskContext(context);
    fenix = buildNoaaCoopsFenixContext(context);
    nav = buildNoaaCoopsRouteContext(context);
    aura = buildNoaaCoopsMedicalContext(context);
  });

  it("rejects an empty filter", () => {
    expect(missingFilter.valid).toBe(false);
  });

  it("empty filter reports the exact required-filters message", () => {
    expect(asInvalid(missingFilter).message).toBe("stationId, lat/lon or bbox required for NOAA CO-OPS coastal context");
  });

  it("rejects an out-of-range latitude", () => {
    expect(invalidLat.valid).toBe(false);
  });

  it("rejects an out-of-range longitude", () => {
    expect(invalidLon.valid).toBe(false);
  });

  it("rejects an invalid bbox", () => {
    expect(invalidBbox.valid).toBe(false);
  });

  it("rejects an invalid units value", () => {
    expect(invalidUnits.valid).toBe(false);
  });

  it("accepts a valid stationId-based request", () => {
    expect(valid.valid).toBe(true);
  });

  it("clamps radiusKm down to the default 50", () => {
    expect(asValid(valid).params.radiusKm).toBe(50);
  });

  it("defaults the datum to MLLW", () => {
    expect(asValid(valid).params.datum).toBe("MLLW");
  });

  it("normalizes the stationId", () => {
    expect(station?.stationId).toBe("9414290");
  });

  it("water_level product normalizes to measurementType observed", () => {
    expect(waterLevel[0]?.measurementType).toBe("observed");
  });

  it("water_level product preserves the requested datum", () => {
    expect(waterLevel[0]?.datum).toBe("MLLW");
  });

  it("predictions product normalizes to measurementType predicted", () => {
    expect(predictions[0]?.measurementType).toBe("predicted");
  });

  it("observation context sourceId is noaa-coops", () => {
    expect(context.sourceId).toBe("noaa-coops");
  });

  it("observation context risk factors flag the datum as explicit", () => {
    expect(context.riskFactors.datumExplicit).toBeTruthy();
  });

  it("observation context risk factors flag observed/predicted as separated", () => {
    expect(context.riskFactors.observedVsPredictedSeparated).toBeTruthy();
  });

  it("evidence sourceId is noaa-coops", () => {
    expect(evidence.sourceId).toBe("noaa-coops");
  });

  it("evidence carries the requested incidentId", () => {
    expect(evidence.incidentId).toBe("incident-1");
  });

  it("adapter status does not require an API key", () => {
    expect(status.requiresApiKey).toBe(false);
  });

  it("adapter status is not an incident source", () => {
    expect(status.isIncidentSource).toBe(false);
  });

  it("adapter status defaults to not visible", () => {
    expect(status.defaultVisible).toBe(false);
  });

  it("risk context surfaces observed-water-level availability", () => {
    expect(risk.coastalObservationRiskContext.observedWaterLevelAvailability).toBeTruthy();
  });

  it("fenix context caveats disclaim it as an official inundation model", () => {
    expect(fenix.caveats.some((item) => item.includes("not an official inundation model"))).toBe(true);
  });

  it("nav context caveats disclaim official route closure", () => {
    expect(nav.routeCaveats.some((item) => item.includes("does not officially close"))).toBe(true);
  });

  it("aura context caveats disclaim medical diagnosis", () => {
    expect(aura.caveats.some((item) => item.includes("does not diagnose"))).toBe(true);
  });
});
