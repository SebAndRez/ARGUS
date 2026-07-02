import { parsedDocumentFromEnvelope } from "@/lib/knowledge-intake/parsers/parserUtils";
import type { ArgusKnowledgeInputEnvelope } from "@/types/knowledgeIntake";

export function parseCsvEnvelope(envelope: ArgusKnowledgeInputEnvelope) {
  const rows = envelope.rawText?.split(/\r?\n/).filter(Boolean) ?? [];
  return parsedDocumentFromEnvelope(envelope, {
    extractionConfidence: rows.length > 1 ? 72 : 35,
    metadata: { parser: "csvParser", rowCount: rows.length },
  });
}
