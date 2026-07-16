import { beforeAll, describe, expect, it } from "vitest";
import {
  buildIocSlsmfEvidence,
  buildIocSlsmfSeaLevelObservationContext,
  getIocSlsmfAdapterStatus,
  getIocSlsmfApiKeyStatus,
  normalizeIocSlsmfObservation,
  normalizeIocSlsmfStation,
  parseIocSlsmfSeaLevelData,
  parseIocSlsmfSensors,
  parseIocSlsmfStationList,
  validateIocSlsmfRequest,
} from "@/lib/knowledge-intake/adapters/iocSlsmfAdapter";
import { buildIocSeaLevelMedicalContext } from "@/lib/aura/iocSeaLevelMedicalContext";
import { buildIocSeaLevelFenixContext } from "@/lib/fenix/iocSeaLevelFenixContext";
import { buildIocSeaLevelRouteContext } from "@/lib/nav/iocSeaLevelRouteContext";
import { buildIocSeaLevelRiskContext } from "@/lib/risk/iocSeaLevelRiskContext";

/**
 * ARGUS Prompt 20 — converted from
 * `src/lib/knowledge-intake/__tests__/iocSlsmfAdapter.test.ts` (a
 * `runIocSlsmfAdapterTest()` export Vitest never ran). The context builder
 * is async, so the shared fixtures are computed once in `beforeAll` (the
 * original computed them once at the top of the run function) rather than
 * per-`it` — every assertion below is preserved as-is from the original
 * `passed:` chain.
 */

const sampleStation = {
  code: "valp",
  name: "Valparaiso",
  country: "Chile",
  lat: "-33.03",
  lon: "-71.63",
  status: "online",
  lastDataTime: new Date().toISOString(),
};

const sampleSensor = {
  sensor_id: "radar-1",
  type: "radar",
  sampling_rate: "1 min",
  datum: "relative",
};

const sampleObservation = {
  code: "valp",
  sensor_id: "radar-1",
  time: new Date().toISOString(),
  value: "1.24",
  units: "m",
  qc_flag: "ok",
};

// validateIocSlsmfRequest returns a discriminated union (`valid: true` with
// `params`, or `valid: false` with `message`). The original file accessed
// `.message`/`.params` inline within the same `&&` chain that also checked
// `.valid`, which TS narrows automatically; splitting each condition into
// its own `it()` loses that inline narrowing, so these two tiny helpers
// restore it without altering any tested value.
function asInvalid(result: ReturnType<typeof validateIocSlsmfRequest>) {
  if (result.valid) throw new Error("expected an invalid validation result");
  return result;
}
function asValid(result: ReturnType<typeof validateIocSlsmfRequest>) {
  if (!result.valid) throw new Error("expected a valid validation result");
  return result;
}

describe("IOC Sea Level Station Monitoring Facility (SLSMF) adapter", () => {
  let keyStatus: ReturnType<typeof getIocSlsmfApiKeyStatus>;
  let missingFilter: ReturnType<typeof validateIocSlsmfRequest>;
  let invalidLat: ReturnType<typeof validateIocSlsmfRequest>;
  let invalidLon: ReturnType<typeof validateIocSlsmfRequest>;
  let invalidBbox: ReturnType<typeof validateIocSlsmfRequest>;
  let valid: ReturnType<typeof validateIocSlsmfRequest>;
  let stations: ReturnType<typeof parseIocSlsmfStationList>;
  let sensors: ReturnType<typeof parseIocSlsmfSensors>;
  let data: ReturnType<typeof parseIocSlsmfSeaLevelData>;
  let station: ReturnType<typeof normalizeIocSlsmfStation>;
  let observation: ReturnType<typeof normalizeIocSlsmfObservation>;
  let context: Awaited<ReturnType<typeof buildIocSlsmfSeaLevelObservationContext>>;
  let evidence: ReturnType<typeof buildIocSlsmfEvidence>;
  let status: ReturnType<typeof getIocSlsmfAdapterStatus>;
  let risk: ReturnType<typeof buildIocSeaLevelRiskContext>;
  let fenix: ReturnType<typeof buildIocSeaLevelFenixContext>;
  let nav: ReturnType<typeof buildIocSeaLevelRouteContext>;
  let aura: ReturnType<typeof buildIocSeaLevelMedicalContext>;

  beforeAll(async () => {
    const previousKey = process.env.IOC_SLSMF_API_KEY;
    delete process.env.IOC_SLSMF_API_KEY;
    keyStatus = getIocSlsmfApiKeyStatus();
    if (previousKey) process.env.IOC_SLSMF_API_KEY = previousKey;

    missingFilter = validateIocSlsmfRequest({});
    invalidLat = validateIocSlsmfRequest({ lat: 91, lon: 0 });
    invalidLon = validateIocSlsmfRequest({ lat: 0, lon: -181 });
    invalidBbox = validateIocSlsmfRequest({ bbox: "10,10,0,0" });
    valid = validateIocSlsmfRequest({ stationCode: "valp", radiusKm: 400, minutes: 999, purpose: "tsunami_context" });
    stations = parseIocSlsmfStationList({ stations: [sampleStation] });
    sensors = parseIocSlsmfSensors({ sensors: [sampleSensor] });
    data = parseIocSlsmfSeaLevelData({ data: [sampleObservation] });
    station = normalizeIocSlsmfStation(sampleStation, { lat: -33, lon: -71.6 });
    observation = normalizeIocSlsmfObservation(sampleObservation, { stationCode: "valp" });
    context = await buildIocSlsmfSeaLevelObservationContext(
      {
        stationCode: "valp",
        includeMetadata: false,
        includeSensors: false,
        includeRecentData: false,
        purpose: "sea_level_monitoring",
      },
      [observation]
    );
    evidence = buildIocSlsmfEvidence(context, { incidentId: "incident-1" });
    status = getIocSlsmfAdapterStatus();
    risk = buildIocSeaLevelRiskContext(context);
    fenix = buildIocSeaLevelFenixContext(context);
    nav = buildIocSeaLevelRouteContext(context);
    aura = buildIocSeaLevelMedicalContext(context);
  });

  it("API key status requires configuration when unset", () => {
    expect(keyStatus.status).toBe("requiresConfiguration");
  });

  it("rejects an empty filter", () => {
    expect(missingFilter.valid).toBe(false);
  });

  it("empty filter reports the exact required-filters message", () => {
    expect(asInvalid(missingFilter).message).toBe("stationCode, lat/lon or bbox required for IOC SLSMF sea level context");
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

  it("accepts a valid stationCode-based request", () => {
    expect(valid.valid).toBe(true);
  });

  it("clamps radiusKm down to the default 250", () => {
    expect(asValid(valid).params.radiusKm).toBe(250);
  });

  it("clamps minutes down to the default 180", () => {
    expect(asValid(valid).params.minutes).toBe(180);
  });

  it("parses exactly one station from the station-list response", () => {
    expect(stations.length).toBe(1);
  });

  it("parses exactly one sensor from the sensors response", () => {
    expect(sensors.length).toBe(1);
  });

  it("parses exactly one observation from the sea-level data response", () => {
    expect(data.length).toBe(1);
  });

  it("normalizes the station code", () => {
    expect(station?.stationCode).toBe("valp");
  });

  it("flags the observation as a relative sea-level reading", () => {
    expect(observation.relativeSeaLevel).toBeTruthy();
  });

  it("flags the observation with a datum caution", () => {
    expect(observation.datumCaution).toBeTruthy();
  });

  it("observation context sourceId is ioc-slsmf", () => {
    expect(context.sourceId).toBe("ioc-slsmf");
  });

  it("observation context's latest reading carries the datum caution", () => {
    expect(context.latest.datumCaution).toBeTruthy();
  });

  it("observation context risk factors flag the relative datum caution", () => {
    expect(context.riskFactors.relativeDatumCaution).toBeTruthy();
  });

  it("evidence sourceId is ioc-slsmf", () => {
    expect(evidence.sourceId).toBe("ioc-slsmf");
  });

  it("evidence carries the requested incidentId", () => {
    expect(evidence.incidentId).toBe("incident-1");
  });

  it("adapter status requires an API key", () => {
    expect(status.requiresApiKey).toBeTruthy();
  });

  it("adapter status is not an incident source", () => {
    expect(status.isIncidentSource).toBe(false);
  });

  it("adapter map layer defaults to not visible", () => {
    expect(status.mapLayer.defaultVisible).toBe(false);
  });

  it("risk context surfaces the relative-datum-caution risk factor", () => {
    expect(risk.seaLevelObservationRiskContext.relativeDatumCaution).toBeTruthy();
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
