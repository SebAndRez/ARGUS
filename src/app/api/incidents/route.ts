import { NextRequest, NextResponse } from "next/server";
import { buildDemoIncidents } from "@/lib/command/incidentBuilder";
import type { IncidentPriority, IncidentStatus, IncidentType } from "@/types/incident";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const limit = Math.min(50, Math.max(1, Number(params.get("limit") ?? 10)));
  const priority = params.get("priority") as IncidentPriority | null;
  const status = params.get("status") as IncidentStatus | null;
  const type = params.get("type") as IncidentType | null;

  let incidents = buildDemoIncidents();
  if (priority) incidents = incidents.filter((incident) => incident.priority === priority);
  if (status) incidents = incidents.filter((incident) => incident.status === status);
  if (type) incidents = incidents.filter((incident) => incident.type === type);

  return NextResponse.json({
    source: "demo_fallback",
    count: incidents.slice(0, limit).length,
    incidents: incidents.slice(0, limit),
  });
}
