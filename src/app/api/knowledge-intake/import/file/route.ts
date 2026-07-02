import { NextResponse } from "next/server";
import { extractKnowledgeEntities } from "@/lib/knowledge-intake/entityExtractor";
import { knowledgeImportTemplates } from "@/lib/knowledge-intake/admin/importTemplates";
import { normalizeKnowledgeInput } from "@/lib/knowledge-intake/incidentNormalizer";
import { parseKnowledgeEnvelope } from "@/lib/knowledge-intake/ingestionPlanner";
import { extractLessonsFromText } from "@/lib/knowledge-intake/lessonExtractor";
import {
  saveKnowledgeDocument,
  saveKnowledgeDocumentChunks,
  saveKnowledgeLesson,
  upsertKnowledgeIncidentByExternalId,
} from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import { calculateEvidenceConfidenceScore } from "@/lib/knowledge-intake/scoring/evidenceScoring";
import { buildDocumentChunks } from "@/lib/knowledge-intake/vector/documentChunker";
import type { ArgusKnowledgeInputEnvelope, ArgusKnowledgeInputType } from "@/types/knowledgeIntake";

export const dynamic = "force-dynamic";

const supportedTypes: ArgusKnowledgeInputType[] = ["pdf", "txt_markdown", "csv", "json", "docx", "xlsx"];

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json()) as Partial<ArgusKnowledgeInputEnvelope>;
    if (body.rawText && body.inputType && supportedTypes.includes(body.inputType)) {
      const envelope: ArgusKnowledgeInputEnvelope = {
        id: body.id ?? `file-preview-${body.inputType}-${body.rawText.length}`,
        inputType: body.inputType,
        sourceId: body.sourceId,
        sourceName: body.sourceName,
        sourceUrl: body.sourceUrl,
        fileName: body.fileName,
        fileMimeType: body.fileMimeType,
        ingestionMode: body.ingestionMode ?? "adminUpload",
        rawText: body.rawText,
        rawMetadata: body.rawMetadata ?? { submittedThrough: "knowledge-intake-file-preview" },
        language: body.language ?? "es",
        country: body.country,
        receivedAt: body.receivedAt ?? "2026-07-02T00:00:00.000Z",
        processingStatus: "normalized",
        tags: body.tags ?? ["file-preview"],
      };
      const parsedDocument = parseKnowledgeEnvelope(envelope);
      const entities = extractKnowledgeEntities(envelope.rawText ?? "");
      const incident = normalizeKnowledgeInput(envelope);
      const lessons = extractLessonsFromText(envelope.rawText ?? "", incident.domain);
      const scoring = calculateEvidenceConfidenceScore({
        sourceReliability: incident.sourceReliabilityScore,
        corroborationCount: incident.evidenceCount,
        geolocationPrecision: typeof incident.latitude === "number" ? 85 : incident.country ? 45 : 15,
        timestampPrecision: incident.occurredAt ? 70 : 25,
        documentQuality: parsedDocument.extractionConfidence,
        extractionConfidence: incident.confidenceScore,
        conflictWithOtherSources: 0,
      });
      let persistResult = null;
      if (body.rawMetadata?.persist === true) {
        const savedDocument = await saveKnowledgeDocument({
          sourceId: envelope.sourceId,
          title: parsedDocument.title ?? incident.title,
          fileName: envelope.fileName,
          fileMimeType: envelope.fileMimeType,
          sourceUrl: envelope.sourceUrl,
          documentType: body.rawMetadata.documentType?.toString() ?? "unknown",
          language: envelope.language,
          country: envelope.country,
          rawText: envelope.rawText,
          metadataJson: JSON.parse(JSON.stringify(parsedDocument.metadata)),
          processingStatus: parsedDocument.needsOcr ? "planned_text_extraction" : "normalized",
          reviewStatus: scoring.finalConfidence >= 75 ? "auto_accepted" : "pending_review",
        });
        const savedIncident = await upsertKnowledgeIncidentByExternalId(incident);
        const chunks = buildDocumentChunks({
          ...parsedDocument,
          id: savedDocument.id,
          sourceId: envelope.sourceId,
          country: envelope.country,
          domain: incident.domain,
          documentType: body.rawMetadata.documentType?.toString() ?? "unknown",
        });
        const savedChunks = await saveKnowledgeDocumentChunks(savedDocument.id, chunks);
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
        currentStatus: "preview_parser_available",
        envelope,
        parsedDocument,
        chunks: buildDocumentChunks(parsedDocument),
        entities,
        incident,
        lessons,
        scoring,
        persistResult,
        supportedTypes,
        plannedParsers: ["pdf", "txt_markdown", "csv", "json", "docx", "xlsx"],
        nextRequiredStep: "Connect durable upload storage and admin review before accepting real files.",
      });
    }
  }

  return NextResponse.json(
    {
      currentStatus: "contract_ready_storage_pending",
      message: "File ingestion accepts parser previews through JSON rawText. Real upload/storage/OCR is not enabled yet.",
      supportedTypes,
      plannedParsers: ["pdf", "txt_markdown", "csv", "json", "docx", "xlsx"],
      nextRequiredStep: "Define storage, malware scanning, file size limits, admin review and OCR workflow.",
      supportedTemplates: knowledgeImportTemplates,
    },
    { status: 202 }
  );
}
