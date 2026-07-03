import type { IngestJobDefinition } from "@/lib/ingest/ingestJobTypes";

export const ARGUS_INGEST_JOBS: IngestJobDefinition[] = [
  { id: "usgs-earthquakes", sourceId: "usgs_earthquake", name: "USGS Earthquakes", enabled: true, intervalMinutes: 1, timeoutMs: 8000, maxRetries: 2, backoffSeconds: 10 },
  { id: "gdacs-alerts", sourceId: "gdacs", name: "GDACS Alerts", enabled: true, intervalMinutes: 5, timeoutMs: 10000, maxRetries: 2, backoffSeconds: 20 },
  { id: "nws-weather-alerts", sourceId: "nws", name: "NWS Weather Alerts", enabled: true, intervalMinutes: 5, timeoutMs: 12000, maxRetries: 2, backoffSeconds: 20 },
  { id: "nasa-firms", sourceId: "nasa_firms", name: "NASA FIRMS", enabled: false, intervalMinutes: 15, timeoutMs: 12000, maxRetries: 1, backoffSeconds: 60 },
  { id: "met-weather", sourceId: "met_norway", name: "MET Norway Weather", enabled: true, intervalMinutes: 10, timeoutMs: 8000, maxRetries: 1, backoffSeconds: 30 },
  { id: "reliefweb", sourceId: "reliefweb", name: "ReliefWeb Reports", enabled: false, intervalMinutes: 30, timeoutMs: 12000, maxRetries: 1, backoffSeconds: 60 },
  { id: "gdelt-conflict", sourceId: "gdelt", name: "GDELT Conflict", enabled: false, intervalMinutes: 15, timeoutMs: 12000, maxRetries: 1, backoffSeconds: 120 },
  { id: "cameras-health", sourceId: "live_cameras", name: "Camera Health", enabled: false, intervalMinutes: 60, timeoutMs: 5000, maxRetries: 0, backoffSeconds: 0 },
  { id: "citizen-reports-rollup", sourceId: "citizen_reports", name: "Citizen Reports Rollup", enabled: true, intervalMinutes: 5, timeoutMs: 5000, maxRetries: 1, backoffSeconds: 10 },
  { id: "quakesense-rollup", sourceId: "quakesense", name: "QuakeSense Rollup", enabled: false, intervalMinutes: 1, timeoutMs: 5000, maxRetries: 0, backoffSeconds: 0 },
  { id: "sensor-safety-rollup", sourceId: "sensor_safety", name: "Sensor Safety Rollup", enabled: false, intervalMinutes: 1, timeoutMs: 5000, maxRetries: 0, backoffSeconds: 0 },
];

export function getIngestJobsForSource(sourceId: string) {
  return ARGUS_INGEST_JOBS.filter((job) => job.sourceId === sourceId);
}
