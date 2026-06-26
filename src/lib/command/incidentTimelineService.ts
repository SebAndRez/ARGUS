import type { Incident, IncidentEvidence, IncidentTimelineEntry } from "@/types/incident";

export function buildIncidentTimeline(
  incident: Incident,
  evidence: IncidentEvidence[]
): IncidentTimelineEntry[] {
  return [
    {
      id: `${incident.id}-created`,
      incidentId: incident.id,
      entryType: "CREATED",
      title: "Incidente operacional creado",
      summary: "ARGUS genero una ficha operacional demo desde evidencia disponible.",
      source: "ARGUS",
      createdAt: incident.createdAt,
    },
    ...evidence.map((item) => ({
      id: `${item.id}-timeline`,
      incidentId: incident.id,
      entryType: "EVIDENCE_ADDED" as const,
      title: item.title,
      summary: item.summary,
      source: item.sourceName,
      createdAt: item.createdAt,
    })),
    {
      id: `${incident.id}-argus-update`,
      incidentId: incident.id,
      entryType: "ARGUS_UPDATED",
      title: "Hipotesis ARGUS actualizada",
      summary: incident.argusSummary,
      source: "ARGUS_RULE",
      createdAt: incident.updatedAt,
    },
  ];
}
