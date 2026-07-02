import { NextResponse } from "next/server";
import { demoKnowledgeEvidence, demoKnowledgeIncidents } from "@/data/knowledgeIntakeDemo";
import { getKnowledgeIncidentById } from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import { getLessonsForIncident } from "@/lib/knowledge-intake/knowledgeMemoryEngine";
import { findSimilarIncidents } from "@/lib/knowledge-intake/similarityEngine";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const persisted = await getKnowledgeIncidentById(id).catch(() => null);
  if (persisted) {
    return NextResponse.json({
      source: "persistent_memory",
      incident: persisted,
    });
  }
  const incident = demoKnowledgeIncidents.find((item) => item.id === id);
  if (!incident) {
    return NextResponse.json({ error: "Knowledge incident not found." }, { status: 404 });
  }
  return NextResponse.json({
    incident,
    evidence: demoKnowledgeEvidence.filter((item) => item.incidentId === incident.id),
    lessons: getLessonsForIncident(incident),
    similar: findSimilarIncidents(incident),
  });
}
