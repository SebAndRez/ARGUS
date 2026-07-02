import { parsedDocumentFromEnvelope } from "@/lib/knowledge-intake/parsers/parserUtils";
import type { ArgusKnowledgeInputEnvelope } from "@/types/knowledgeIntake";

export function parsePlainTextEnvelope(envelope: ArgusKnowledgeInputEnvelope) {
  return parsedDocumentFromEnvelope(envelope, {
    extractionConfidence: envelope.rawText?.trim() ? 66 : 15,
    metadata: { parser: "plainTextParser" },
  });
}
