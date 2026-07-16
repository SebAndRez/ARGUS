import { NextRequest, NextResponse } from "next/server";
import { getCommandCenterIncidents } from "@/lib/command/incidentBuilder";
import { buildSourceHealthSummary } from "@/lib/sources/sourceHealthEngine";
import type { IncidentPriority, IncidentStatus, IncidentType } from "@/types/incident";

export const dynamic = "force-dynamic";

/**
 * ARGUS v1.0.3.4 — see docs/product/ARGUS_COMMAND_CENTER_STATUS.md. This
 * endpoint has no real operational incident source connected (no Prisma,
 * no `KnowledgeIncident`, no Global Watch). `getCommandCenterIncidents()`
 * is fail-closed: in production without `ARGUS_ALLOW_DEMO_DATA=true`, it
 * never calls the synthetic builders at all, so `incidents` is always `[]`
 * and `operational` is always `false`.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const limit = Math.min(50, Math.max(1, Number(params.get("limit") ?? 10)));
  const priority = params.get("priority") as IncidentPriority | null;
  const status = params.get("status") as IncidentStatus | null;
  const type = params.get("type") as IncidentType | null;

  const { mode, operational, incidents: allIncidents, message } = getCommandCenterIncidents();

  let incidents = allIncidents;
  if (priority) incidents = incidents.filter((incident) => incident.priority === priority);
  if (status) incidents = incidents.filter((incident) => incident.status === status);
  if (type) incidents = incidents.filter((incident) => incident.type === type);

  const page = incidents.slice(0, limit);

  return NextResponse.json({
    mode,
    operational,
    message,
    count: page.length,
    sourceQuality: {
      note: "La confianza operacional se afecta por fuentes demo, stale o no oficiales.",
      summary: buildSourceHealthSummary(),
    },
    incidents: page,
  });
}
