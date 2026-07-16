import { describe, expect, it } from "vitest";
import {
  buildNoaaNceiTsunamiIncident,
  buildNoaaNceiTsunamiRunupEvidence,
  getNoaaNceiTsunamiAdapterStatus,
  normalizeNoaaNceiTsunamiDataset,
  normalizeNoaaNceiTsunamiEvent,
  normalizeNoaaNceiTsunamiRunup,
  parseNoaaNceiTsunamiTsv,
  scoreNoaaNceiHistoricalTsunamiSeverity,
  scoreNoaaNceiTsunamiHistoricalConfidence,
} from "@/lib/knowledge-intake/adapters/noaaNceiTsunamiAdapter";

/**
 * ARGUS Prompt 20 — converted from
 * `src/lib/knowledge-intake/__tests__/noaaNceiTsunamiAdapter.test.ts` (a
 * `runNoaaNceiTsunamiAdapterTest()` export Vitest never ran).
 */

const eventsTsv = `ID\tYEAR\tMONTH\tDAY\tLATITUDE\tLONGITUDE\tLOCATION_NAME\tCOUNTRY\tREGION\tCAUSE\tVALIDITY\tMAXIMUM_WATER_HEIGHT\tDEATHS\tINJURIES\tHOUSES_DESTROYED\tEQ_MAGNITUDE\tEQ_DEPTH
1001\t1960\t5\t22\t-38.143\t-73.407\tValdivia source area\tChile\tSouth America\tEarthquake\tDefinite\t10.7\t61\t20\t200\t9.5\t33
1002\t1200\t\t\t\t\tAncient source\tJapan\tAsia\tUnknown\tQuestionable\t\t\t\t\t\t`;

const runupsTsv = `RUNUP_ID\tEVENT_ID\tLOCATION_NAME\tCOUNTRY\tREGION\tLATITUDE\tLONGITUDE\tWATER_HEIGHT\tINUNDATION_DISTANCE\tDEATHS\tVALIDITY\tMEASUREMENT_QUALITY
R1\t1001\tCorral\tChile\tLos Rios\t-39.887\t-73.431\t8.5\t500\t10\tDefinite\tObserved
R2\t1001\tValdivia\tChile\tLos Rios\t-39.814\t-73.245\t4.2\t\t0\tProbable\tStudy
R3\t1002\tUnknown coast\tJapan\tAsia\t\t\t\t\t\tQuestionable\tHistorical`;

describe("NOAA NCEI historical tsunami adapter", () => {
  const eventRows = parseNoaaNceiTsunamiTsv(eventsTsv, "events");
  const runupRows = parseNoaaNceiTsunamiTsv(runupsTsv, "runups");
  const event = normalizeNoaaNceiTsunamiEvent(eventRows[0]);
  const ancientEvent = normalizeNoaaNceiTsunamiEvent(eventRows[1]);
  const runup = normalizeNoaaNceiTsunamiRunup(runupRows[0]);
  const normalized = normalizeNoaaNceiTsunamiDataset(eventRows, runupRows, {
    eventId: "1001",
    includeRunups: true,
    maxRunupsPerEvent: 50,
    limit: 10,
  });
  const incident = event
    ? buildNoaaNceiTsunamiIncident(event, normalized.runups.filter((item) => item.tsunamiEventId === event.tsunamiEventId))
    : null;
  const evidence = runup && event ? buildNoaaNceiTsunamiRunupEvidence(runup, event) : null;
  const status = getNoaaNceiTsunamiAdapterStatus();

  it("parses both TSV event rows", () => {
    expect(eventRows.length).toBe(2);
  });

  it("parses all three TSV runup rows", () => {
    expect(runupRows.length).toBe(3);
  });

  it("normalized event carries the noaa-ncei-tsunami sourceId", () => {
    expect(event?.sourceId).toBe("noaa-ncei-tsunami");
  });

  it("normalized event preserves the tsunamiEventId", () => {
    expect(event?.tsunamiEventId).toBe("1001");
  });

  it("normalized event preserves sourceLatitude", () => {
    expect(event?.sourceLatitude).toBe(-38.143);
  });

  it("normalized event maps CAUSE to a lowercase cause value", () => {
    expect(event?.cause).toBe("earthquake");
  });

  it("an event from year 1200 is flagged as ancientEvent", () => {
    expect(ancientEvent?.dataQualityFlags).toContain("ancientEvent");
  });

  it("an event missing lat/lon is flagged as missingCoordinates", () => {
    expect(ancientEvent?.dataQualityFlags).toContain("missingCoordinates");
  });

  it("normalized runup preserves the runupId", () => {
    expect(runup?.runupId).toBe("R1");
  });

  it("normalized runup preserves maxWaterHeight", () => {
    expect(runup?.maxWaterHeight).toBe(8.5);
  });

  it("dataset normalization yields exactly one incident for the filtered event", () => {
    expect(normalized.incidents.length).toBe(1);
  });

  it("dataset normalization yields both runups as evidence", () => {
    expect(normalized.evidence.length).toBe(2);
  });

  it("built incident carries noaa-ncei-tsunami as its primary sourceId", () => {
    expect(incident?.sourceIds[0]).toBe("noaa-ncei-tsunami");
  });

  it("built incident is flagged as having no invented geometry", () => {
    expect(incident?.technicalFactors.noInventedGeometry).toBe(true);
  });

  it("built incident is flagged as not a live source", () => {
    expect(incident?.technicalFactors.notLiveSource).toBe(true);
  });

  it("built evidence carries the noaa-ncei-tsunami sourceId", () => {
    expect(evidence?.sourceId).toBe("noaa-ncei-tsunami");
  });

  it("built evidence references the built incident's id", () => {
    expect(evidence?.incidentId).toBe(incident?.id);
  });

  it("the 1960 Valdivia event scores as critical historical severity", () => {
    expect(scoreNoaaNceiHistoricalTsunamiSeverity(event!, normalized.runups)).toBe("critical");
  });

  it("the 1960 Valdivia event scores at least 80 historical confidence", () => {
    expect(scoreNoaaNceiTsunamiHistoricalConfidence(event!, normalized.runups)).toBeGreaterThanOrEqual(80);
  });

  it("adapter map layer defaults to not visible", () => {
    expect(status.mapLayer.defaultVisible).toBe(false);
  });

  it("adapter map layer is flagged as having no invented geometry", () => {
    expect(status.mapLayer.noInventedGeometry).toBe(true);
  });
});
