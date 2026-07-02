import { parsedDocumentFromEnvelope } from "@/lib/knowledge-intake/parsers/parserUtils";
import type { ArgusKnowledgeInputEnvelope } from "@/types/knowledgeIntake";

export function parseHtmlEnvelope(envelope: ArgusKnowledgeInputEnvelope) {
  const text = (envelope.rawText ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return parsedDocumentFromEnvelope(envelope, {
    text,
    extractionConfidence: text.trim() ? 62 : 25,
    metadata: { parser: "htmlParser" },
  });
}
