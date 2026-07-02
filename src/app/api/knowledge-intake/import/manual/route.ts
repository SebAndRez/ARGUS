import { NextResponse } from "next/server";
import { extractKnowledgeEntities } from "@/lib/knowledge-intake/entityExtractor";
import { normalizeKnowledgeInput } from "@/lib/knowledge-intake/incidentNormalizer";
import { parseKnowledgeEnvelope } from "@/lib/knowledge-intake/ingestionPlanner";
import { extractLessonsFromText } from "@/lib/knowledge-intake/lessonExtractor";
import { calculateEvidenceConfidenceScore } from "@/lib/knowledge-intake/scoring/evidenceScoring";
import type { ArgusKnowledgeInputEnvelope } from "@/types/knowledgeIntake";

export const dynamic = "force-dynamic";

type ManualImportBody = {
  rawText?: string;
  title?: string;
  sourceId?: string;
  sourceName?: string;
  sourceUrl?: string;
  country?: string;
  region?: string;
  suggestedDomain?: string;
  mode?: "historical" | "live" | "doctrine" | "technical_report" | "citizen_context";
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
    rawMetadata: {
      submittedThrough: "knowledge-intake-manual-api",
      title: body.title,
      region: body.region,
      suggestedDomain: body.suggestedDomain,
      mode: body.mode ?? "historical",
    },
    language: body.language ?? "es",
    country: body.country,
    receivedAt: "2026-07-02T00:00:00.000Z",
    processingStatus: "normalized",
    tags: body.tags ?? ["manual"],
  };
  const parsedDocument = parseKnowledgeEnvelope(envelope);
  const entities = extractKnowledgeEntities(body.rawText);
  const incident = normalizeKnowledgeInput(envelope);
  const shouldExtractLessons =
    body.mode === "technical_report" ||
    body.mode === "doctrine" ||
    /lesson|failure|investigation|informe|reporte tecnico/i.test(body.rawText);
  const scoring = calculateEvidenceConfidenceScore({
    sourceReliability: incident.sourceReliabilityScore,
    corroborationCount: incident.evidenceCount,
    geolocationPrecision: typeof incident.latitude === "number" && typeof incident.longitude === "number" ? 85 : incident.country ? 45 : 15,
    timestampPrecision: incident.occurredAt ? 70 : 25,
    documentQuality: parsedDocument.extractionConfidence,
    extractionConfidence: incident.confidenceScore,
    conflictWithOtherSources: 0,
  });

  return NextResponse.json({
    envelope,
    parsedDocument,
    entities,
    incident,
    lessons: shouldExtractLessons ? extractLessonsFromText(body.rawText, incident.domain) : [],
    scoring,
    status: "accepted_for_review",
  });
}
