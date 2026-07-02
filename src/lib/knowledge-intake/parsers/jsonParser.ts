import { parsedDocumentFromEnvelope } from "@/lib/knowledge-intake/parsers/parserUtils";
import type { ArgusKnowledgeInputEnvelope } from "@/types/knowledgeIntake";

export function parseJsonEnvelope(envelope: ArgusKnowledgeInputEnvelope) {
  let parsed: unknown = null;
  try {
    parsed = envelope.rawText ? JSON.parse(envelope.rawText) : envelope.rawMetadata;
  } catch {
    parsed = null;
  }
  return parsedDocumentFromEnvelope(envelope, {
    text: envelope.rawText ?? JSON.stringify(envelope.rawMetadata ?? {}, null, 2),
    extractionConfidence: parsed ? 78 : 35,
    metadata: { parser: "jsonParser", validJson: Boolean(parsed) },
  });
}
