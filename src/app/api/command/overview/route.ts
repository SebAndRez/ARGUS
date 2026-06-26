import { NextResponse } from "next/server";
import { buildDemoIncidents } from "@/lib/command/incidentBuilder";
import { getCommandSourceHealth } from "@/lib/command/sourceHealthService";
import type { IncidentPriority, SourceHealthStatus } from "@/types/incident";

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

export async function GET() {
  const incidents = buildDemoIncidents();
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
      ],
      updatedAt: new Date().toISOString(),
    },
  });
}
