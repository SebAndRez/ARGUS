import { NextRequest, NextResponse } from "next/server";
import { buildDemoIncidents } from "@/lib/command/incidentBuilder";
import { buildIncidentFromSafetyCheck } from "@/lib/mobile-safety/mobileSafetyIncidentAdapter";
import { getSafetyChecks } from "@/lib/mobile-safety/mobileSafetyService";
import { buildIncidentFromQuakeSenseCluster } from "@/lib/quakesense/quakesenseIncidentAdapter";
import { getQuakeSenseClusters } from "@/lib/quakesense/quakesenseMemoryStore";
import { buildIncidentFromSensorSafetyDetection } from "@/lib/sensor-safety/sensorSafetyIncidentAdapter";
import { getSensorSafetyDetections } from "@/lib/sensor-safety/sensorSafetyStore";
import type {
  IncidentCommandView,
  IncidentPriority,
  IncidentStatus,
  IncidentType,
} from "@/types/incident";

export const dynamic = "force-dynamic";

const isIncident = (
  incident: IncidentCommandView | null
): incident is IncidentCommandView => Boolean(incident);

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const limit = Math.min(50, Math.max(1, Number(params.get("limit") ?? 10)));
  const priority = params.get("priority") as IncidentPriority | null;
  const status = params.get("status") as IncidentStatus | null;
  const type = params.get("type") as IncidentType | null;

  let incidents = [
    ...getQuakeSenseClusters().map(buildIncidentFromQuakeSenseCluster),
    ...getSafetyChecks().map(buildIncidentFromSafetyCheck).filter(isIncident),
    ...getSensorSafetyDetections()
      .map(buildIncidentFromSensorSafetyDetection)
      .filter(isIncident),
    ...buildDemoIncidents(),
  ];
  if (priority) incidents = incidents.filter((incident) => incident.priority === priority);
  if (status) incidents = incidents.filter((incident) => incident.status === status);
  if (type) incidents = incidents.filter((incident) => incident.type === type);

  return NextResponse.json({
    source: "demo_fallback",
    count: incidents.slice(0, limit).length,
    incidents: incidents.slice(0, limit),
  });
}
