import type { CrisisEvent, EventSeverity } from "@/types/crisis";
import type { ArgusIncidentKnowledge } from "@/types/knowledgeIntake";

function severityToEventSeverity(severity: ArgusIncidentKnowledge["severity"]): EventSeverity {
  if (severity === "critical") return "CRITICAL";
  if (severity === "high") return "HIGH";
  if (severity === "medium") return "MEDIUM";
  return "LOW";
}

export function knowledgeIncidentToOperationalMapEvent(incident: ArgusIncidentKnowledge): CrisisEvent | null {
  if (typeof incident.latitude !== "number" || typeof incident.longitude !== "number") return null;
  return {
    id: `knowledge-${incident.id}`,
    title: incident.title,
    category: incident.domain,
    description: incident.summary,
    latitude: incident.latitude,
    longitude: incident.longitude,
    locationText: [incident.locality, incident.region, incident.country].filter(Boolean).join(", ") || null,
    severity: severityToEventSeverity(incident.severity),
    priority: severityToEventSeverity(incident.severity),
    type: "ALERT",
    status: "UNDER_REVIEW",
    createdAt: incident.createdAt,
    updatedAt: incident.updatedAt,
    aiSummary: incident.summary,
    aiConfidence: incident.confidenceScore,
    confidence: incident.confidenceScore,
    confidenceLabel: incident.confidenceScore >= 80 ? "high" : incident.confidenceScore >= 60 ? "medium" : "low",
    sourceCategory: "knowledge_intake",
    sourceId: incident.sourceIds[0] ?? null,
    sourceSummary: incident.sourceNames.join(", "),
    whyItMatters: incident.lessonsLearned[0]?.summary ?? null,
    recommendedAction: incident.recommendedActions[0]?.text ?? null,
    operatorRecommendedAction: incident.recommendedActions[0]?.text ?? null,
    lifecycleStatus: "verifying",
    verificationCount: incident.evidenceCount,
    isDemo: false,
    recordType: "Report",
  };
}
