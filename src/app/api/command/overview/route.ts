import { NextResponse } from "next/server";
import { buildDemoIncidents } from "@/lib/command/incidentBuilder";
import { getCommandSourceHealth } from "@/lib/command/sourceHealthService";
import { buildIncidentFromSafetyCheck } from "@/lib/mobile-safety/mobileSafetyIncidentAdapter";
import { getSafetyChecks } from "@/lib/mobile-safety/mobileSafetyService";
import { buildIncidentFromQuakeSenseCluster } from "@/lib/quakesense/quakesenseIncidentAdapter";
import { getQuakeSenseClusters } from "@/lib/quakesense/quakesenseMemoryStore";
import { buildIncidentFromSensorSafetyDetection } from "@/lib/sensor-safety/sensorSafetyIncidentAdapter";
import { getSensorSafetyDetections } from "@/lib/sensor-safety/sensorSafetyStore";
import type {
  IncidentCommandView,
  IncidentPriority,
  SourceHealthStatus,
} from "@/types/incident";

export const dynamic = "force-dynamic";

const priorities: IncidentPriority[] = [
  "P0_CRITICAL",
  "P1_HIGH",
  "P2_MEDIUM",
  "P3_LOW",
  "P4_INFO",
];
const sourceStatuses: SourceHealthStatus[] = [
  "ACTIVE",
  "DEGRADED",
  "STALE",
  "DISABLED",
  "UNKNOWN",
];

const isIncident = (
  incident: IncidentCommandView | null
): incident is IncidentCommandView => Boolean(incident);

export async function GET() {
  const quakeSenseIncidents = getQuakeSenseClusters().map(
    buildIncidentFromQuakeSenseCluster
  );
  const safetyIncidents = getSafetyChecks()
    .map(buildIncidentFromSafetyCheck)
    .filter(isIncident);
  const sensorSafetyIncidents = getSensorSafetyDetections()
    .map(buildIncidentFromSensorSafetyDetection)
    .filter(isIncident);
  const incidents = [
    ...quakeSenseIncidents,
    ...safetyIncidents,
    ...sensorSafetyIncidents,
    ...buildDemoIncidents(),
  ];
  const sources = getCommandSourceHealth();

  return NextResponse.json({
    overview: {
      totalActiveIncidents: incidents.length,
      priorityCounts: Object.fromEntries(
        priorities.map((priority) => [
          priority,
          incidents.filter((incident) => incident.priority === priority).length,
        ])
      ),
      sourceCounts: Object.fromEntries(
        sourceStatuses.map((status) => [
          status,
          sources.filter((source) => source.status === status).length,
        ])
      ),
      topIncidents: incidents.slice(0, 5),
      systemAlerts: [
        "Modo demo: incidentes construidos desde fallback local.",
        "ARGUS estima, no confirma sin fuente oficial.",
        "QuakeSense y Mobile Safety son experimentales; requieren revision humana.",
        "Sensor Safety Suite es demo/runtime y no reemplaza servicios de emergencia.",
      ],
      updatedAt: new Date().toISOString(),
    },
  });
}
