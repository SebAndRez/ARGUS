import { parsedDocumentFromEnvelope } from "@/lib/knowledge-intake/parsers/parserUtils";
import type { ArgusKnowledgeInputEnvelope } from "@/types/knowledgeIntake";

export function parseXlsxEnvelope(envelope: ArgusKnowledgeInputEnvelope) {
  return parsedDocumentFromEnvelope(envelope, {
    extractionConfidence: envelope.rawText ? 50 : 20,
    metadata: { parser: "xlsxParser", extractionMode: "tabular_text_stub" },
  });
}
