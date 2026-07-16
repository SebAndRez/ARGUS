import { scoreEvidence } from "@/lib/command/evidenceCorrelationEngine";
import { calculateOperationalPriority } from "@/lib/command/operationalPriorityEngine";
import {
  argusIncidentLimitations,
  buildRecommendedActions,
} from "@/lib/command/recommendedActions";
import { buildIncidentTimeline } from "@/lib/command/incidentTimelineService";
import { buildIncidentFromSafetyCheck } from "@/lib/mobile-safety/mobileSafetyIncidentAdapter";
import { getSafetyChecks } from "@/lib/mobile-safety/mobileSafetyService";
import { buildIncidentFromQuakeSenseCluster } from "@/lib/quakesense/quakesenseIncidentAdapter";
import { getQuakeSenseClusters } from "@/lib/quakesense/quakesenseMemoryStore";
import { buildIncidentFromSensorSafetyDetection } from "@/lib/sensor-safety/sensorSafetyIncidentAdapter";
import { getSensorSafetyDetections } from "@/lib/sensor-safety/sensorSafetyStore";
import { isDemoDataAllowed } from "@/lib/security/productionGuard";
import type {
  Incident,
  IncidentCommandView,
  IncidentEvidence,
  IncidentInputEvent,
  IncidentLink,
  IncidentType,
} from "@/types/incident";

function mapIncidentType(event: IncidentInputEvent): IncidentType {
  const category = event.category?.toLowerCase() ?? "";
  if (event.type === "SOS") return "sos";
  if (category.includes("fire") || category.includes("incendio")) return "fire";
  if (category.includes("medical") || category.includes("medic")) return "medical";
  if (category.includes("earthquake") || category.includes("sismo")) return "earthquake";
  if (category.includes("tsunami")) return "tsunami";
  if (category.includes("weather") || category.includes("clima")) return "weather";
  return event.type === "REPORT" ? "citizen_report" : "unknown";
}

export function buildIncidentFromCitizenReport(
  event: IncidentInputEvent
): IncidentCommandView {
  const now = new Date().toISOString();
  const evidence: IncidentEvidence[] = [
    {
      id: `${event.id}-evidence`,
      incidentId: `incident-${event.id}`,
      sourceType: event.type === "REPORT" ? "CITIZEN" : "ARGUS_RULE",
      sourceId: event.id,
      sourceName: event.sourceName ?? "Reporte ARGUS",
      evidenceKind: event.type === "REPORT" ? "CITIZEN_REPORT" : "EVENT_DETECTION",
      reliability: event.confidence ?? 45,
      confidenceImpact: Math.max(8, Math.round((event.confidence ?? 45) / 3)),
      title: event.title,
      summary: event.description,
      observedAt: event.createdAt,
      createdAt: event.createdAt,
    },
  ];
  const evidenceScore = scoreEvidence(evidence);
  const priorityExplanation = calculateOperationalPriority({
    severity: event.severity,
    confidence: evidenceScore.confidence,
    sourceTypes: evidence.map((item) => item.sourceType),
    citizenReportCount: event.type === "REPORT" ? 1 : 0,
  });
  const incident: Incident = {
    id: `incident-${event.id}`,
    title: event.title,
    type: mapIncidentType(event),
    subtype: event.category,
    status: evidenceScore.hasOfficial ? "ARGUS_HYPOTHESIS" : "VERIFYING",
    priority: priorityExplanation.priority,
    severity: event.severity,
    confidence: evidenceScore.confidence,
    locationLat: event.latitude,
    locationLng: event.longitude,
    radiusKm: 2,
    sourceSummary: evidenceScore.explanation,
    argusSummary:
      "ARGUS agrupa evidencia disponible y genera una hipotesis operacional para revision humana.",
    recommendedAction: "Verificar fuente oficial y evidencia cercana antes de escalar.",
    createdAt: event.createdAt,
    updatedAt: now,
    lastEvidenceAt: event.createdAt,
    isDemo: true,
    dataMode: "demo",
    persistent: false,
    severityMode: "simulated",
  };
  const links: IncidentLink[] = [
    {
      id: `${event.id}-link`,
      incidentId: incident.id,
      linkedType: event.type === "REPORT" ? "REPORT" : "EXTERNAL_EVENT",
      linkedId: event.id,
      relation: "RELATED_TO",
      createdAt: now,
    },
  ];
  const viewBase = {
    ...incident,
    evidence,
    timeline: buildIncidentTimeline(incident, evidence),
    links,
    priorityExplanation,
    recommendedActions: [] as string[],
    limitations: argusIncidentLimitations,
  };

  return {
    ...viewBase,
    recommendedActions: buildRecommendedActions(viewBase),
  };
}

export function buildDemoIncidents(events: IncidentInputEvent[] = []) {
  return events.length > 0
    ? events.slice(0, 10).map(buildIncidentFromCitizenReport)
    : [
        buildIncidentFromCitizenReport({
          id: "demo-command-fire",
          title: "Incendio urbano demo cerca de infraestructura critica",
          category: "fire",
          description: "Incidente demo para Centro de Mando ARGUS.",
          latitude: -33.4489,
          longitude: -70.6693,
          severity: "HIGH",
          type: "ALERT",
          status: "NEW",
          createdAt: new Date().toISOString(),
          confidence: 72,
          sourceName: "ARGUS demo",
        }),
      ];
}

const isIncidentView = (
  incident: IncidentCommandView | null
): incident is IncidentCommandView => Boolean(incident);

export type CommandCenterMode = "demo" | "demo-disabled";

export interface CommandCenterIncidentResult {
  /** "demo-disabled" whenever `isDemoDataAllowed()` is false — never "demo" in that case, regardless of what internal builders would otherwise produce. */
  mode: CommandCenterMode;
  /**
   * Always `false`. Nothing behind this endpoint is a persisted, validated,
   * canonical incident source yet (no Prisma, no `KnowledgeIncident`, no
   * Global Watch) — see docs/product/ARGUS_COMMAND_CENTER_STATUS.md. This
   * field exists so no consumer can misreport this data as operational.
   */
  operational: false;
  incidents: IncidentCommandView[];
  message: string;
}

/**
 * ARGUS v1.0.3.4 — single, fail-closed choke point for every consumer of
 * the synthetic/volatile "Command Center" incident sources (QuakeSense
 * clusters, Mobile Safety checks, Sensor Safety detections, and the
 * hardcoded demo fallback). Reuses `isDemoDataAllowed()`
 * (src/lib/security/productionGuard.ts) — the same variable already used
 * to gate Global Watch/Chile alerts seed mode — rather than introducing a
 * second demo flag. In production without explicit authorization, this
 * returns an empty, valid result instead of ever calling the synthetic
 * builders: `buildDemoIncidents()`/the memory-store readers are not even
 * invoked, so there is no risk of their output leaking through a filter
 * bug downstream.
 */
export function getCommandCenterIncidents(): CommandCenterIncidentResult {
  if (!isDemoDataAllowed()) {
    return {
      mode: "demo-disabled",
      operational: false,
      incidents: [],
      message: "No operational incident source is connected to this endpoint.",
    };
  }

  const incidents = [
    ...getQuakeSenseClusters().map(buildIncidentFromQuakeSenseCluster),
    ...getSafetyChecks().map(buildIncidentFromSafetyCheck).filter(isIncidentView),
    ...getSensorSafetyDetections()
      .map(buildIncidentFromSensorSafetyDetection)
      .filter(isIncidentView),
    ...buildDemoIncidents(),
  ];

  return {
    mode: "demo",
    operational: false,
    incidents,
    message: "Demo/synthetic incidents only — no operational source is connected.",
  };
}
