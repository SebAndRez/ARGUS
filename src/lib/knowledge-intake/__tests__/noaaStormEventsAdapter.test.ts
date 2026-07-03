import {
  buildNoaaStormExternalId,
  mapNoaaEventTypeToArgusDomain,
  normalizeNoaaStormEventDetail,
  normalizeNoaaStormEventDetails,
  parseNoaaDamageValue,
  parseNoaaStormEventsDetailsCsv,
} from "@/lib/knowledge-intake/adapters/noaaStormEventsAdapter";

const sampleCsv = `EVENT_ID,EPISODE_ID,EVENT_TYPE,BEGIN_DATE_TIME,END_DATE_TIME,STATE,CZ_NAME,BEGIN_LAT,BEGIN_LON,END_LAT,END_LON,INJURIES_DIRECT,INJURIES_INDIRECT,DEATHS_DIRECT,DEATHS_INDIRECT,DAMAGE_PROPERTY,DAMAGE_CROPS,MAGNITUDE,MAGNITUDE_TYPE,TOR_F_SCALE,FLOOD_CAUSE,SOURCE,EPISODE_NARRATIVE,EVENT_NARRATIVE
1001,501,Tornado,03-MAY-2025 12:00:00,03-MAY-2025 12:15:00,TX,TRAVIS,30.2,-97.7,30.3,-97.6,2,1,0,0,1.5M,25K,90,EG,F2,,Emergency Manager,"Episode narrative, with comma","Event narrative with ""quoted"" text"
1002,502,Flash Flood,04-MAY-2025 02:00:00,04-MAY-2025 03:30:00,TX,HARRIS,,,,,0,0,1,0,0,0,,,,Heavy Rain,Law Enforcement,,Flood narrative`;

export function runNoaaStormEventsAdapterTest() {
  const rows = parseNoaaStormEventsDetailsCsv(sampleCsv);
  const tornado = normalizeNoaaStormEventDetail(rows[0]);
  const flood = normalizeNoaaStormEventDetail(rows[1]);
  const normalized = normalizeNoaaStormEventDetails(rows);
  const badDamage = parseNoaaDamageValue("UNKNOWN");

  return {
    passed:
      rows.length === 2 &&
      rows[0].EVENT_NARRATIVE.includes("\"quoted\"") &&
      parseNoaaDamageValue("1.5M").value === 1_500_000 &&
      parseNoaaDamageValue("25K").value === 25_000 &&
      badDamage.parsed === false &&
      mapNoaaEventTypeToArgusDomain("Tornado") === "tornado" &&
      mapNoaaEventTypeToArgusDomain("Flash Flood") === "flood" &&
      mapNoaaEventTypeToArgusDomain("Winter Storm") === "winter_storm" &&
      mapNoaaEventTypeToArgusDomain("Excessive Heat") === "heatwave" &&
      tornado?.sourceIds[0] === "noaa-storm-events" &&
      tornado?.technicalFactors.historicalDataset === true &&
      tornado?.technicalFactors.notLiveSource === true &&
      tornado?.impact?.propertyDamage === 1_500_000 &&
      tornado?.casualties?.injuries === 3 &&
      flood?.casualties?.deaths === 1 &&
      flood?.latitude === undefined &&
      normalized.incidents.length === 2 &&
      normalized.evidence.length === 2 &&
      buildNoaaStormExternalId(rows[0]) === "NOAA-STORM:1001",
    tornado,
    flood,
    normalized,
  };
}
