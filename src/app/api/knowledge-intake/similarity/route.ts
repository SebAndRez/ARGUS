import { NextResponse } from "next/server";
import { demoKnowledgeIncidents } from "@/data/knowledgeIntakeDemo";
import { normalizeKnowledgeInput } from "@/lib/knowledge-intake/incidentNormalizer";
import { findSimilarIncidents } from "@/lib/knowledge-intake/similarityEngine";
import type { ArgusIncidentKnowledge, ArgusKnowledgeInputEnvelope } from "@/types/knowledgeIntake";

export const dynamic = "force-dynamic";

type SimilarityBody =
  | { incident: ArgusIncidentKnowledge; text?: never }
  | { incident?: never; text: string; sourceName?: string };

export async function POST(request: Request) {
  const body = (await request.json()) as SimilarityBody;
  const incident =
    body.incident ??
    normalizeKnowledgeInput({
      id: "similarity-input",
      inputType: "manual_admin",
      sourceName: body.sourceName ?? "Similarity text input",
      ingestionMode: "manual",
      rawText: body.text,
      receivedAt: "2026-07-02T00:00:00.000Z",
      processingStatus: "normalized",
      tags: ["similarity"],
    } satisfies ArgusKnowledgeInputEnvelope);

  return NextResponse.json({
    incidentId: incident.id,
    baselineCount: demoKnowledgeIncidents.length,
    similar: findSimilarIncidents(incident),
  });
}
