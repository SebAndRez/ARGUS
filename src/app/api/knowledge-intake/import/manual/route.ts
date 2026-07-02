import { NextResponse } from "next/server";
import { normalizeKnowledgeInput } from "@/lib/knowledge-intake/incidentNormalizer";
import type { ArgusKnowledgeInputEnvelope } from "@/types/knowledgeIntake";

export const dynamic = "force-dynamic";

type ManualImportBody = {
  rawText?: string;
  sourceId?: string;
  sourceName?: string;
  sourceUrl?: string;
  country?: string;
  language?: string;
  tags?: string[];
};

export async function POST(request: Request) {
  const body = (await request.json()) as ManualImportBody;
  if (!body.rawText?.trim()) {
    return NextResponse.json({ error: "rawText es requerido para carga manual." }, { status: 400 });
  }

  const envelope: ArgusKnowledgeInputEnvelope = {
    id: `manual-${body.rawText.length}-${body.sourceId ?? "unknown"}`,
    inputType: "manual_admin",
    sourceId: body.sourceId,
    sourceName: body.sourceName,
    sourceUrl: body.sourceUrl,
    ingestionMode: "manual",
    rawText: body.rawText,
    rawMetadata: { submittedThrough: "knowledge-intake-manual-api" },
    language: body.language ?? "es",
    country: body.country,
    receivedAt: "2026-07-02T00:00:00.000Z",
    processingStatus: "normalized",
    tags: body.tags ?? ["manual"],
  };

  return NextResponse.json({
    envelope,
    incident: normalizeKnowledgeInput(envelope),
    status: "accepted_for_review",
  });
}
