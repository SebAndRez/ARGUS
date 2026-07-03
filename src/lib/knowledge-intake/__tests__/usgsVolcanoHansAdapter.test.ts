import {
  buildUsgsVolcanoExternalId,
  mapUsgsVolcanoAlertLevelToSeverity,
  mapUsgsVolcanoColorCodeToAviationRisk,
  normalizeUsgsVolcanoEvents,
  normalizeUsgsVolcanoNotice,
  normalizeUsgsVolcanoRecord,
} from "@/lib/knowledge-intake/adapters/usgsVolcanoHansAdapter";

export function runUsgsVolcanoHansAdapterTest() {
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
  const incident = normalizeUsgsVolcanoRecord(elevated);
  const notice = normalizeUsgsVolcanoNotice({
    ...elevated,
    noticeId: "123",
    noticeType: "Volcano Activity Notice",
  });
  const deduped = normalizeUsgsVolcanoEvents([elevated, elevated]);
  const missingLocation = normalizeUsgsVolcanoRecord({
    vName: "No Location Volcano",
    volcanoCd: "000000",
    alertLevel: "UNASSIGNED",
    colorCode: "UNASSIGNED",
  });

  return {
    passed:
      incident?.domain === "volcano" &&
      incident.severity === "high" &&
      incident.technicalFactors.alertLevel === "WATCH" &&
      incident.technicalFactors.aviationColorCode === "ORANGE" &&
      incident.technicalFactors.previousAlertLevel === "ADVISORY" &&
      incident.technicalFactors.previousAviationColorCode === "YELLOW" &&
      incident.sourceIds[0] === "usgs-volcano-hans" &&
      notice?.sourceId === "usgs-volcano-hans" &&
      notice.id.includes("notice:123") &&
      deduped.length === 1 &&
      missingLocation?.latitude === undefined &&
      mapUsgsVolcanoAlertLevelToSeverity("WARNING") === "critical" &&
      mapUsgsVolcanoAlertLevelToSeverity("NORMAL") === "low" &&
      mapUsgsVolcanoColorCodeToAviationRisk("RED").includes("aviation") &&
      buildUsgsVolcanoExternalId({ noticeId: "123" }) === "notice:123",
    incident,
    notice,
    deduped,
    missingLocation,
  };
}
