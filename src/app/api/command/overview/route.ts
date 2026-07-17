import { NextResponse } from "next/server";
import { getCommandCenterIncidents } from "@/lib/command/incidentBuilder";
import { getCommandSourceHealth } from "@/lib/command/sourceHealthService";
import { getPredictiveAnalyses } from "@/lib/predictive-core/predictiveFeed";
import { classifyLifecycleVisibility } from "@/lib/lifecycle/operationalVisibilityPolicy";
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

/**
 * ARGUS v1.0.3.4 — see docs/product/ARGUS_COMMAND_CENTER_STATUS.md. Incident
 * counts/priorities below come exclusively from `getCommandCenterIncidents()`
 * (fail-closed on `isDemoDataAllowed()`) — in production without explicit
 * authorization, `totalActiveIncidents`/`priorityCounts`/`topIncidents` are
 * always zero/empty, never backfilled from the synthetic builders.
 */
export async function GET() {
  // SEC-NEW-001: this route has no session/role check (confirmed — no
  // `getCurrentUser()` call anywhere in this file), so it must always
  // request the redacted public projection from Predictive Core. Never
  // pass "operator" here without first adding real session gating.
  const predictiveAnalyses = await getPredictiveAnalyses({ limit: 8, audience: "public" });
  const { mode, operational, incidents: allIncidents, message } = getCommandCenterIncidents();
  const sources = getCommandSourceHealth();
  // Prompt 10 — `incidents` puede incluir estados terminales (`CLOSED`/
  // `DISMISSED`); ninguno de los constructores demo actuales los produce hoy
  // (verificado por inspección), pero el conteo/listado "activo" del Command
  // Center no debía depender de esa coincidencia — se aplica la misma
  // política de vigencia usada en el resto de los endpoints.
  const incidents = allIncidents.filter((incident) => classifyLifecycleVisibility(incident.status).visible);

  return NextResponse.json({
    overview: {
      mode,
      operational,
      message,
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
        mode === "demo-disabled"
          ? "Sin fuente operacional conectada. Datos de demostracion desactivados en este entorno."
          : "Modo demo: incidentes construidos desde fallback local. ARGUS estima, no confirma sin fuente oficial.",
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
