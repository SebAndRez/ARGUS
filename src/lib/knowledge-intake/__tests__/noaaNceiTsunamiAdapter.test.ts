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

const eventsTsv = `ID\tYEAR\tMONTH\tDAY\tLATITUDE\tLONGITUDE\tLOCATION_NAME\tCOUNTRY\tREGION\tCAUSE\tVALIDITY\tMAXIMUM_WATER_HEIGHT\tDEATHS\tINJURIES\tHOUSES_DESTROYED\tEQ_MAGNITUDE\tEQ_DEPTH
1001\t1960\t5\t22\t-38.143\t-73.407\tValdivia source area\tChile\tSouth America\tEarthquake\tDefinite\t10.7\t61\t20\t200\t9.5\t33
1002\t1200\t\t\t\t\tAncient source\tJapan\tAsia\tUnknown\tQuestionable\t\t\t\t\t\t`;

const runupsTsv = `RUNUP_ID\tEVENT_ID\tLOCATION_NAME\tCOUNTRY\tREGION\tLATITUDE\tLONGITUDE\tWATER_HEIGHT\tINUNDATION_DISTANCE\tDEATHS\tVALIDITY\tMEASUREMENT_QUALITY
R1\t1001\tCorral\tChile\tLos Rios\t-39.887\t-73.431\t8.5\t500\t10\tDefinite\tObserved
R2\t1001\tValdivia\tChile\tLos Rios\t-39.814\t-73.245\t4.2\t\t0\tProbable\tStudy
R3\t1002\tUnknown coast\tJapan\tAsia\t\t\t\t\t\tQuestionable\tHistorical`;

export function runNoaaNceiTsunamiAdapterTest() {
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
  const incident = event ? buildNoaaNceiTsunamiIncident(event, normalized.runups.filter((item) => item.tsunamiEventId === event.tsunamiEventId)) : null;
  const evidence = runup && event ? buildNoaaNceiTsunamiRunupEvidence(runup, event) : null;
  const status = getNoaaNceiTsunamiAdapterStatus();

  return {
    passed:
      eventRows.length === 2 &&
      runupRows.length === 3 &&
      event?.sourceId === "noaa-ncei-tsunami" &&
      event?.tsunamiEventId === "1001" &&
      event?.sourceLatitude === -38.143 &&
      event?.cause === "earthquake" &&
      ancientEvent?.dataQualityFlags.includes("ancientEvent") &&
      ancientEvent?.dataQualityFlags.includes("missingCoordinates") &&
      runup?.runupId === "R1" &&
      runup?.maxWaterHeight === 8.5 &&
      normalized.incidents.length === 1 &&
      normalized.evidence.length === 2 &&
      incident?.sourceIds[0] === "noaa-ncei-tsunami" &&
      incident?.technicalFactors.noInventedGeometry === true &&
      incident?.technicalFactors.notLiveSource === true &&
      evidence?.sourceId === "noaa-ncei-tsunami" &&
      evidence?.incidentId === incident?.id &&
      scoreNoaaNceiHistoricalTsunamiSeverity(event!, normalized.runups) === "critical" &&
      scoreNoaaNceiTsunamiHistoricalConfidence(event!, normalized.runups) >= 80 &&
      status.mapLayer.defaultVisible === false &&
      status.mapLayer.noInventedGeometry === true,
    event,
    runup,
    incident,
    evidence,
    normalized,
    status,
  };
}
