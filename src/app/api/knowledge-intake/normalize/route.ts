import { NextResponse } from "next/server";
import { extractKnowledgeEntities } from "@/lib/knowledge-intake/entityExtractor";
import { normalizeKnowledgeInput } from "@/lib/knowledge-intake/incidentNormalizer";
import { parseKnowledgeEnvelope } from "@/lib/knowledge-intake/ingestionPlanner";
import { extractLessonsFromText } from "@/lib/knowledge-intake/lessonExtractor";
import { calculateEvidenceConfidenceScore } from "@/lib/knowledge-intake/scoring/evidenceScoring";
import type { ArgusKnowledgeInputEnvelope } from "@/types/knowledgeIntake";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const envelope = (await request.json()) as ArgusKnowledgeInputEnvelope;
  if (!envelope?.id || !envelope.inputType || !envelope.ingestionMode) {
    return NextResponse.json({ error: "KnowledgeInputEnvelope invalido." }, { status: 400 });
  }
  const parsedDocument = parseKnowledgeEnvelope(envelope);
  const entities = extractKnowledgeEntities(envelope.rawText ?? parsedDocument.text);
  const incident = normalizeKnowledgeInput(envelope);
  const mode = envelope.rawMetadata?.mode?.toString();
  const looksTechnical = mode === "technical_report" || mode === "doctrine" || /lesson|failure|investigation|informe|reporte tecnico/i.test(envelope.rawText ?? "");
  return NextResponse.json({
    envelope,
    parsedDocument,
    entities,
    incident,
    lessons: looksTechnical ? extractLessonsFromText(envelope.rawText ?? parsedDocument.text, incident.domain) : [],
    scoring: calculateEvidenceConfidenceScore({
      sourceReliability: incident.sourceReliabilityScore,
      corroborationCount: incident.evidenceCount,
      geolocationPrecision: typeof incident.latitude === "number" && typeof incident.longitude === "number" ? 85 : incident.country ? 45 : 15,
      timestampPrecision: incident.occurredAt ? 70 : 25,
      documentQuality: parsedDocument.extractionConfidence,
      extractionConfidence: incident.confidenceScore,
      conflictWithOtherSources: 0,
    }),
    note: "Normalizacion local conservadora; requiere revision humana antes de uso operacional.",
  });
}
