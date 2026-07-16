import { describe, expect, it } from "vitest";
import {
  buildUsgsVolcanoExternalId,
  mapUsgsVolcanoAlertLevelToSeverity,
  mapUsgsVolcanoColorCodeToAviationRisk,
  normalizeUsgsVolcanoEvents,
  normalizeUsgsVolcanoNotice,
  normalizeUsgsVolcanoRecord,
} from "@/lib/knowledge-intake/adapters/usgsVolcanoHansAdapter";

/**
 * ARGUS Prompt 20 — converted from
 * `src/lib/knowledge-intake/__tests__/usgsVolcanoHansAdapter.test.ts` (a
 * `runUsgsVolcanoHansAdapterTest()` export Vitest never ran — this repo's
 * `vitest.config.ts` only includes `tests/**`). Every assertion below is
 * preserved from the original, split one per `it`.
 */
const elevated = {
  vName: "Kilauea",
  volcanoCd: "332010",
  obs: "HVO",
  alertLevel: "WATCH",
  colorCode: "ORANGE",
  alertLevelPrev: "ADVISORY",
  colorCodePrev: "YELLOW",
  nvewsThreat: "Very High",
  lat: 19.421,
  long: -155.287,
  sentUtc: "2026-07-02T12:00:00Z",
  noticeSynopsis: "Elevated unrest continues.",
  noticeUrl: "https://volcanoes.usgs.gov/hans-public/notice/123",
};

describe("normalizeUsgsVolcanoRecord", () => {
  const incident = normalizeUsgsVolcanoRecord(elevated);

  it("classifies the domain as volcano", () => {
    expect(incident?.domain).toBe("volcano");
  });

  it("classifies WATCH/ORANGE unrest as high severity", () => {
    expect(incident?.severity).toBe("high");
  });

  it("preserves the current alert level", () => {
    expect(incident?.technicalFactors.alertLevel).toBe("WATCH");
  });

  it("preserves the current aviation color code", () => {
    expect(incident?.technicalFactors.aviationColorCode).toBe("ORANGE");
  });

  it("preserves the previous alert level", () => {
    expect(incident?.technicalFactors.previousAlertLevel).toBe("ADVISORY");
  });

  it("preserves the previous aviation color code", () => {
    expect(incident?.technicalFactors.previousAviationColorCode).toBe("YELLOW");
  });

  it("tags the incident with the usgs-volcano-hans source id", () => {
    expect(incident?.sourceIds[0]).toBe("usgs-volcano-hans");
  });

  it("returns undefined lat/long when no location is provided", () => {
    const missingLocation = normalizeUsgsVolcanoRecord({
      vName: "No Location Volcano",
      volcanoCd: "000000",
      alertLevel: "UNASSIGNED",
      colorCode: "UNASSIGNED",
    });
    expect(missingLocation?.latitude).toBeUndefined();
  });
});

describe("normalizeUsgsVolcanoNotice", () => {
  const notice = normalizeUsgsVolcanoNotice({
    ...elevated,
    noticeId: "123",
    noticeType: "Volcano Activity Notice",
  });

  it("tags the notice with the usgs-volcano-hans source id", () => {
    expect(notice?.sourceId).toBe("usgs-volcano-hans");
  });

  it("builds a notice id that includes the notice number", () => {
    expect(notice?.id.includes("notice:123")).toBe(true);
  });
});

describe("normalizeUsgsVolcanoEvents", () => {
  it("dedupes identical records into a single event", () => {
    const deduped = normalizeUsgsVolcanoEvents([elevated, elevated]);
    expect(deduped.length).toBe(1);
  });
});

describe("severity and risk mapping helpers", () => {
  it("maps WARNING alert level to critical severity", () => {
    expect(mapUsgsVolcanoAlertLevelToSeverity("WARNING")).toBe("critical");
  });

  it("maps NORMAL alert level to low severity", () => {
    expect(mapUsgsVolcanoAlertLevelToSeverity("NORMAL")).toBe("low");
  });

  it("describes RED color code aviation risk", () => {
    expect(mapUsgsVolcanoColorCodeToAviationRisk("RED").includes("aviation")).toBe(true);
  });

  it("builds an external id from a notice id", () => {
    expect(buildUsgsVolcanoExternalId({ noticeId: "123" })).toBe("notice:123");
  });
});
