import { NextResponse } from "next/server";
import { normalizeKnowledgeInput } from "@/lib/knowledge-intake/incidentNormalizer";
import { reasonAboutIncident } from "@/lib/knowledge-intake/reasoning/operationalReasoningEngine";
import type { ArgusIncidentKnowledge, ArgusKnowledgeInputEnvelope } from "@/types/knowledgeIntake";

export const dynamic = "force-dynamic";

type ReasonBody =
  | { incident: ArgusIncidentKnowledge; envelope?: never }
  | { incident?: never; envelope: ArgusKnowledgeInputEnvelope };

export async function POST(request: Request) {
  const body = (await request.json()) as ReasonBody;
  const incident = body.incident ?? normalizeKnowledgeInput(body.envelope);
  return NextResponse.json({
    incidentId: incident.id,
    reasoning: reasonAboutIncident(incident),
  });
}
