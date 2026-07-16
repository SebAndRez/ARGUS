import { describe, expect, it } from "vitest";
import {
  buildNoaaStormExternalId,
  mapNoaaEventTypeToArgusDomain,
  normalizeNoaaStormEventDetail,
  normalizeNoaaStormEventDetails,
  parseNoaaDamageValue,
  parseNoaaStormEventsDetailsCsv,
} from "@/lib/knowledge-intake/adapters/noaaStormEventsAdapter";

/**
 * ARGUS Prompt 20 — converted from
 * `src/lib/knowledge-intake/__tests__/noaaStormEventsAdapter.test.ts` (a
 * `runNoaaStormEventsAdapterTest()` export Vitest never ran).
 */

const sampleCsv = `EVENT_ID,EPISODE_ID,EVENT_TYPE,BEGIN_DATE_TIME,END_DATE_TIME,STATE,CZ_NAME,BEGIN_LAT,BEGIN_LON,END_LAT,END_LON,INJURIES_DIRECT,INJURIES_INDIRECT,DEATHS_DIRECT,DEATHS_INDIRECT,DAMAGE_PROPERTY,DAMAGE_CROPS,MAGNITUDE,MAGNITUDE_TYPE,TOR_F_SCALE,FLOOD_CAUSE,SOURCE,EPISODE_NARRATIVE,EVENT_NARRATIVE
1001,501,Tornado,03-MAY-2025 12:00:00,03-MAY-2025 12:15:00,TX,TRAVIS,30.2,-97.7,30.3,-97.6,2,1,0,0,1.5M,25K,90,EG,F2,,Emergency Manager,"Episode narrative, with comma","Event narrative with ""quoted"" text"
1002,502,Flash Flood,04-MAY-2025 02:00:00,04-MAY-2025 03:30:00,TX,HARRIS,,,,,0,0,1,0,0,0,,,,Heavy Rain,Law Enforcement,,Flood narrative`;

describe("NOAA Storm Events (historical CSV) adapter", () => {
  const rows = parseNoaaStormEventsDetailsCsv(sampleCsv);
  const tornado = normalizeNoaaStormEventDetail(rows[0]);
  const flood = normalizeNoaaStormEventDetail(rows[1]);
  const normalized = normalizeNoaaStormEventDetails(rows);
  const badDamage = parseNoaaDamageValue("UNKNOWN");

  it("parses both CSV rows", () => {
    expect(rows.length).toBe(2);
  });

  it("CSV parsing correctly unescapes quoted narrative text", () => {
    expect(rows[0].EVENT_NARRATIVE.includes('"quoted"')).toBe(true);
  });

  it('parses "1.5M" damage as 1,500,000', () => {
    expect(parseNoaaDamageValue("1.5M").value).toBe(1_500_000);
  });

  it('parses "25K" damage as 25,000', () => {
    expect(parseNoaaDamageValue("25K").value).toBe(25_000);
  });

  it("an unparseable damage value reports parsed: false", () => {
    expect(badDamage.parsed).toBe(false);
  });

  it("maps Tornado event type to the tornado ARGUS domain", () => {
    expect(mapNoaaEventTypeToArgusDomain("Tornado")).toBe("tornado");
  });

  it("maps Flash Flood event type to the flood ARGUS domain", () => {
    expect(mapNoaaEventTypeToArgusDomain("Flash Flood")).toBe("flood");
  });

  it("maps Winter Storm event type to the winter_storm ARGUS domain", () => {
    expect(mapNoaaEventTypeToArgusDomain("Winter Storm")).toBe("winter_storm");
  });

  it("maps Excessive Heat event type to the heatwave ARGUS domain", () => {
    expect(mapNoaaEventTypeToArgusDomain("Excessive Heat")).toBe("heatwave");
  });

  it("normalized tornado carries noaa-storm-events as its primary sourceId", () => {
    expect(tornado?.sourceIds[0]).toBe("noaa-storm-events");
  });

  it("normalized tornado is flagged as a historicalDataset", () => {
    expect(tornado?.technicalFactors.historicalDataset).toBe(true);
  });

  it("normalized tornado is flagged as not a live source", () => {
    expect(tornado?.technicalFactors.notLiveSource).toBe(true);
  });

  it("normalized tornado parses DAMAGE_PROPERTY (1.5M) into propertyDamage", () => {
    expect(tornado?.impact?.propertyDamage).toBe(1_500_000);
  });

  it("normalized tornado sums direct + indirect injuries", () => {
    expect(tornado?.casualties?.injuries).toBe(3);
  });

  it("normalized flood carries its direct death count", () => {
    expect(flood?.casualties?.deaths).toBe(1);
  });

  it("normalized flood has no latitude when BEGIN_LAT is blank", () => {
    expect(flood?.latitude).toBeUndefined();
  });

  it("dataset normalization yields one incident per CSV row", () => {
    expect(normalized.incidents.length).toBe(2);
  });

  it("dataset normalization yields one evidence entry per CSV row", () => {
    expect(normalized.evidence.length).toBe(2);
  });

  it("builds the external id as NOAA-STORM:<EVENT_ID>", () => {
    expect(buildNoaaStormExternalId(rows[0])).toBe("NOAA-STORM:1001");
  });
});
