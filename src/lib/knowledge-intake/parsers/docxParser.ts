import { parsedDocumentFromEnvelope } from "@/lib/knowledge-intake/parsers/parserUtils";
import type { ArgusKnowledgeInputEnvelope } from "@/types/knowledgeIntake";

export function parseDocxEnvelope(envelope: ArgusKnowledgeInputEnvelope) {
  return parsedDocumentFromEnvelope(envelope, {
    extractionConfidence: envelope.rawText ? 55 : 20,
    metadata: { parser: "docxParser", extractionMode: "text_only_stub" },
  });
}
