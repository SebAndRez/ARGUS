import type { getKnowledgeIncidents } from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import {
  classifyGlobalThreat,
  threatToArgusEventType,
  type GlobalThreatType,
} from "@/lib/vigia/threatClassifier";
import { getVigiaSource } from "@/lib/vigia/sourceRegistry";
import type { IncidentLifecycle } from "@/lib/vigia/incidentLifecycle";
import type {
  ArgusConfidence,
  ArgusEvent,
  ArgusEventStatus,
  ArgusSeverity,
  ArgusSourceType,
} from "@/types/argusEvent";

type PersistedKnowledgeIncident = Awaited<ReturnType<typeof getKnowledgeIncidents>>[number];

/**
 * Convierte un `KnowledgeIncident` persistido por Global Watch en un
 * `ArgusEvent` para el mapa operacional (misma ruta de render
 * `ArgusEventLayer` que usan las alertas Chile: icono por tipo, color por
 * severidad, pulso si está activo, popup con fuente/confianza/acciones).
 */

const LIFECYCLE_TO_STATUS: Record<IncidentLifecycle, ArgusEventStatus> = {
  new: "active",
  active: "active",
  monitoring: "monitoring",
  contained: "monitoring",
  resolved: "resolved",
  archived: "archived",
};

function mapSeverity(severity: string): ArgusSeverity {
  if (severity === "critical" || severity === "high" || severity === "medium" || severity === "low") return severity;
  return "medium";
}

function mapConfidence(confidenceScore: number, unconfirmed: boolean): ArgusConfidence {
  if (unconfirmed) return confidenceScore >= 65 ? "medium" : "low";
  if (confidenceScore >= 90) return "verified";
  if (confidenceScore >= 78) return "high";
  if (confidenceScore >= 65) return "medium_high";
  if (confidenceScore >= 50) return "medium";
  return "low";
}

function sourceTypeFor(sourceId: string): ArgusSourceType {
  if (sourceId === "news_evidence") return "news";
  const definition = getVigiaSource(sourceId);
  if (!definition) return "global_feed";
  if (definition.isOfficial) return "official";
  return definition.role === "context" ? "model_context" : "global_feed";
}

export function vigiaIncidentToArgusEvent(incident: PersistedKnowledgeIncident): ArgusEvent | null {
  if (typeof incident.latitude !== "number" || typeof incident.longitude !== "number") return null;

  const severity = mapSeverity(incident.severity);
  const tags = (incident.tagsJson as string[] | null) ?? [];
  const unconfirmed = tags.includes("no-confirmado");
  const technicalFactors = (incident.technicalFactorsJson as Record<string, unknown> | null) ?? {};
  const lifecycle = (typeof technicalFactors.lifecycle === "string"
    ? technicalFactors.lifecycle
    : "active") as IncidentLifecycle;

  const threat: GlobalThreatType = classifyGlobalThreat({
    domain: incident.domain,
    subtype: incident.subtype,
    title: incident.title,
    tags,
  });

  const rawEvidenceRefs = (incident.rawEvidenceRefsJson as string[] | null) ?? [];
  const recommendedActions = ((incident.recommendedActionsJson as Array<{ text?: string }> | null) ?? [])
    .map((action) => action.text)
    .filter((text): text is string => Boolean(text));
  const occurredAtIso = incident.occurredAt?.toISOString();
  const detectedAtIso = incident.detectedAt?.toISOString() ?? occurredAtIso ?? incident.createdAt.toISOString();
  const sourceType = sourceTypeFor(incident.sourceId);

  return {
    id: `vigia-${incident.id}`,
    title: unconfirmed ? `${incident.title} (No confirmado)` : incident.title,
    country: incident.country ?? "—",
    region: incident.region ?? undefined,
    commune: incident.locality ?? undefined,
    eventType: threatToArgusEventType(threat),
    severity,
    status: LIFECYCLE_TO_STATUS[lifecycle] ?? "active",
    confidence: mapConfidence(incident.confidenceScore, unconfirmed),
    sourceType,
    sources: [
      {
        sourceId: incident.sourceId,
        sourceName: incident.sourceName,
        sourceType,
        url: rawEvidenceRefs[0],
        publishedAt: occurredAtIso,
      },
    ],
    geometry: { type: "point", coordinates: [incident.latitude, incident.longitude] },
    geometryPrecision: "approximate_point",
    validFrom: occurredAtIso,
    detectedAt: detectedAtIso,
    lastUpdated: incident.updatedAt.toISOString(),
    attribution: incident.sourceName,
    needsOfficialConfirmation: unconfirmed,
    operationalSummary: incident.summary,
    recommendedActions,
    tags: [...tags, `vigia:${threat.toLowerCase()}`, `lifecycle:${lifecycle}`],
    isDemo: tags.includes("seed"),
  };
}
