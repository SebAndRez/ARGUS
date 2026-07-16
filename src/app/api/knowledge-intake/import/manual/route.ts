import { NextResponse } from "next/server";
import { extractKnowledgeEntities } from "@/lib/knowledge-intake/entityExtractor";
import { normalizeKnowledgeInput } from "@/lib/knowledge-intake/incidentNormalizer";
import { parseKnowledgeEnvelope } from "@/lib/knowledge-intake/ingestionPlanner";
import { extractLessonsFromText } from "@/lib/knowledge-intake/lessonExtractor";
import {
  saveKnowledgeDocument,
  saveKnowledgeDocumentChunks,
  saveKnowledgeEvidence,
  saveKnowledgeLesson,
  upsertKnowledgeIncidentByExternalId,
} from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import { calculateEvidenceConfidenceScore } from "@/lib/knowledge-intake/scoring/evidenceScoring";
import { buildDocumentChunks } from "@/lib/knowledge-intake/vector/documentChunker";
import { requireOperator } from "@/lib/security/apiGuards";
import { rejectOversizedPayload } from "@/lib/security/payloadSizeGuard";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";
import type { ArgusKnowledgeInputEnvelope } from "@/types/knowledgeIntake";

export const dynamic = "force-dynamic";

/** Generous cap for a manual text submission — normalizer/extractor cost scales with text size. */
const MAX_MANUAL_IMPORT_BYTES = 2 * 1024 * 1024; // 2 MB

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
  persist?: boolean;
  reviewStatus?: "auto_accepted" | "pending_review" | "rejected" | "needs_more_evidence";
  language?: string;
  tags?: string[];
};

export async function POST(request: Request) {
  const { user, response: authResponse } = await requireOperator();
  if (authResponse || !user) return authResponse ?? NextResponse.json({ error: "Autenticacion requerida." }, { status: 401 });

  const oversized = rejectOversizedPayload(request, MAX_MANUAL_IMPORT_BYTES);
  if (oversized) return oversized;

  // Rate limit runs before parsing the body — an over-quota operator never
  // pays the cost of JSON parsing, entity extraction or persistence.
  const rateLimitOutcome = await enforceRateLimit({
    policy: "knowledge_import_manual",
    request,
    identity: { userId: user.id },
  });
  const rateLimitedResponse = rateLimitResponseForOutcome(rateLimitOutcome);
  if (rateLimitedResponse) return rateLimitedResponse;

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
  let persistResult = null;
  if (body.persist) {
    const savedDocument = await saveKnowledgeDocument({
      sourceId: body.sourceId,
      title: body.title ?? parsedDocument.title ?? incident.title,
      sourceUrl: body.sourceUrl,
      documentType: body.mode ?? "unknown",
      language: envelope.language,
      country: body.country,
      rawText: body.rawText,
      metadataJson: JSON.parse(JSON.stringify({
        envelopeId: envelope.id,
        region: body.region,
        suggestedDomain: body.suggestedDomain,
        parser: parsedDocument.metadata,
      })),
      processingStatus: "normalized",
      reviewStatus: body.reviewStatus ?? (scoring.finalConfidence >= 75 ? "auto_accepted" : "pending_review"),
    });
    const savedIncident = await upsertKnowledgeIncidentByExternalId(incident);
    const chunks = buildDocumentChunks({
      ...parsedDocument,
      id: savedDocument.id,
      sourceId: body.sourceId,
      country: body.country,
      domain: incident.domain,
      documentType: body.mode ?? "unknown",
    });
    const savedChunks = await saveKnowledgeDocumentChunks(savedDocument.id, chunks);
    await saveKnowledgeEvidence({
      id: `manual-evidence-${envelope.id}`,
      incidentId: savedIncident.incident.id,
      sourceId: body.sourceId ?? "manual_input",
      sourceName: body.sourceName ?? "Manual knowledge input",
      title: body.title ?? incident.title,
      url: body.sourceUrl,
      summary: incident.summary,
      confidenceScore: scoring,
      locationConfidence: typeof incident.latitude === "number" ? 85 : incident.country ? 45 : 15,
      timestampConfidence: incident.occurredAt ? 70 : 25,
      extractedAt: new Date().toISOString(),
    });
    const lessons = shouldExtractLessons ? extractLessonsFromText(body.rawText, incident.domain) : [];
    for (const lesson of lessons) {
      await saveKnowledgeLesson(lesson, savedIncident.incident.id);
    }
    persistResult = {
      documentId: savedDocument.id,
      incidentId: savedIncident.incident.id,
      incidentAction: savedIncident.action,
      chunks: savedChunks.count,
      lessons: lessons.length,
    };
  }

  return NextResponse.json({
    envelope,
    parsedDocument,
    entities,
    incident,
    lessons: shouldExtractLessons ? extractLessonsFromText(body.rawText, incident.domain) : [],
    scoring,
    persistResult,
    status: "accepted_for_review",
  });
}
