import { parsedDocumentFromEnvelope } from "@/lib/knowledge-intake/parsers/parserUtils";
import type { ArgusKnowledgeInputEnvelope } from "@/types/knowledgeIntake";

export function parseRssEnvelope(envelope: ArgusKnowledgeInputEnvelope) {
  const text = envelope.rawText ?? "";
  const itemCount = (text.match(/<item\b|<entry\b/g) ?? []).length;
  return parsedDocumentFromEnvelope(envelope, {
    text: text.replace(/<[^>]+>/g, " "),
    extractionConfidence: itemCount > 0 ? 70 : 35,
    metadata: { parser: "rssParser", itemCount },
  });
}
