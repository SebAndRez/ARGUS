import { parsedDocumentFromEnvelope } from "@/lib/knowledge-intake/parsers/parserUtils";
import type { ArgusKnowledgeInputEnvelope } from "@/types/knowledgeIntake";

export function parsePdfEnvelope(envelope: ArgusKnowledgeInputEnvelope) {
  const hasText = Boolean(envelope.rawText?.trim());
  return parsedDocumentFromEnvelope(envelope, {
    extractionConfidence: hasText ? 58 : 18,
    needsOcr: !hasText,
    metadata: {
      parser: "pdfParser",
      ocrStatus: hasText ? "not_required" : "planned_for_scanned_pdf",
      reviewReason: hasText ? undefined : "PDF may be scanned or text was not provided.",
    },
  });
}
