import { NextResponse } from "next/server";
import { buildDemoIncidents } from "@/lib/command/incidentBuilder";
import { getCommandSourceHealth } from "@/lib/command/sourceHealthService";
import { buildIncidentFromSafetyCheck } from "@/lib/mobile-safety/mobileSafetyIncidentAdapter";
import { getSafetyChecks } from "@/lib/mobile-safety/mobileSafetyService";
import { buildIncidentFromQuakeSenseCluster } from "@/lib/quakesense/quakesenseIncidentAdapter";
import { getQuakeSenseClusters } from "@/lib/quakesense/quakesenseMemoryStore";
import { buildIncidentFromSensorSafetyDetection } from "@/lib/sensor-safety/sensorSafetyIncidentAdapter";
import { getSensorSafetyDetections } from "@/lib/sensor-safety/sensorSafetyStore";
import { getPredictiveAnalyses } from "@/lib/predictive-core/predictiveFeed";
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
  const predictiveAnalyses = await getPredictiveAnalyses({ limit: 8 });
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
        ...predictiveAnalyses
          .filter((analysis) => analysis.commandCenterEligible)
          .slice(0, 3)
          .map(
            (analysis) =>
              `Intelligence hint ${analysis.severity}: ${analysis.title} (${analysis.status}, confianza ${analysis.confidence}%).`
          ),
        "Modo demo: incidentes construidos desde fallback local.",
        "ARGUS estima, no confirma sin fuente oficial.",
        "QuakeSense y Mobile Safety son experimentales; requieren revision humana.",
        "Sensor Safety Suite es demo/runtime y no reemplaza servicios de emergencia.",
        ...sources
          .filter((source) => source.status === "DEGRADED" || source.status === "DISABLED")
          .slice(0, 3)
          .map((source) => `${source.name}: ${source.freshnessLabel}`),
      ],
      sourceHealth: sources,
      intelligenceHints: predictiveAnalyses
        .filter((analysis) => analysis.commandCenterEligible)
        .map((analysis) => ({
          id: analysis.id,
          inputId: analysis.inputId,
          title: analysis.title,
          priority: analysis.severity,
          status: analysis.status,
          confidence: analysis.confidence,
          recommendedAction: analysis.recommendedAction,
          requiresHumanValidation: analysis.primaryMode !== "official",
        })),
      updatedAt: new Date().toISOString(),
    },
  });
}
