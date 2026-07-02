import { NextRequest, NextResponse } from "next/server";
import { knowledgeIncidentToOperationalMapEvent } from "@/lib/knowledge-intake/map/knowledgeIncidentToOperationalMapEvent";
import { getKnowledgeIncidents } from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import type { ArgusIncidentKnowledge } from "@/types/knowledgeIntake";

export const dynamic = "force-dynamic";

function persistedIncidentToKnowledge(incident: Awaited<ReturnType<typeof getKnowledgeIncidents>>[number]): ArgusIncidentKnowledge {
  return {
    id: incident.id,
    title: incident.title,
    summary: incident.summary,
    domain: incident.domain as ArgusIncidentKnowledge["domain"],
    subtype: incident.subtype ?? undefined,
    severity: incident.severity as ArgusIncidentKnowledge["severity"],
    confidenceScore: incident.confidenceScore,
    actionabilityScore: incident.actionabilityScore,
    sourceReliabilityScore: incident.sourceReliabilityScore,
    evidenceCount: 1,
    sourceIds: [incident.sourceId],
    sourceNames: [incident.sourceName],
    occurredAt: incident.occurredAt?.toISOString(),
    detectedAt: incident.detectedAt?.toISOString(),
    country: incident.country ?? undefined,
    region: incident.region ?? undefined,
    locality: incident.locality ?? undefined,
    latitude: incident.latitude ?? undefined,
    longitude: incident.longitude ?? undefined,
    geometry: (incident.geometryJson as Record<string, unknown> | null) ?? undefined,
    casualties: undefined,
    impact: undefined,
    technicalFactors: (incident.technicalFactorsJson as ArgusIncidentKnowledge["technicalFactors"] | null) ?? {},
    causes: (incident.causesJson as string[] | null) ?? [],
    contributingFactors: (incident.contributingFactorsJson as string[] | null) ?? [],
    responseActions: (incident.responseActionsJson as string[] | null) ?? [],
    lessonsLearned: [],
    recommendedActions: (incident.recommendedActionsJson as ArgusIncidentKnowledge["recommendedActions"] | null) ?? [],
    relatedHistoricalEvents: (incident.relatedHistoricalEventsJson as string[] | null) ?? [],
    similarIncidentIds: (incident.similarIncidentIdsJson as string[] | null) ?? [],
    tags: (incident.tagsJson as string[] | null) ?? [],
    language: incident.language ?? undefined,
    rawEvidenceRefs: (incident.rawEvidenceRefsJson as string[] | null) ?? [],
    createdAt: incident.createdAt.toISOString(),
    updatedAt: incident.updatedAt.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const incidents = await getKnowledgeIncidents({
    domain: params.get("domain") ?? undefined,
    sourceId: params.get("sourceId") ?? undefined,
    reviewStatus: params.get("reviewStatus") ?? undefined,
    since: params.get("since") ?? undefined,
    minConfidence: params.get("minConfidence") ? Number(params.get("minConfidence")) : undefined,
    withCoordinates: true,
    limit: params.get("limit") ? Number(params.get("limit")) : 100,
  });
  const events = incidents
    .map((incident) => knowledgeIncidentToOperationalMapEvent(persistedIncidentToKnowledge(incident)))
    .filter(Boolean);
  return NextResponse.json({
    count: events.length,
    events,
    note: "Read-only map projection. Knowledge incidents are not inserted into /api/events automatically.",
  });
}
