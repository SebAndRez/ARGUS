import type {
  ArgusKnowledgeInputEnvelope,
  ArgusKnowledgeParsedDocument,
} from "@/types/knowledgeIntake";

export function chunkText(text: string, maxLength = 1200) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const chunks: string[] = [];
  for (let index = 0; index < normalized.length; index += maxLength) {
    chunks.push(normalized.slice(index, index + maxLength));
  }
  return chunks;
}

export function parsedDocumentFromEnvelope(
  envelope: ArgusKnowledgeInputEnvelope,
  options?: {
    title?: string;
    text?: string;
    extractionConfidence?: number;
    needsOcr?: boolean;
    metadata?: Record<string, unknown>;
  }
): ArgusKnowledgeParsedDocument {
  const text = options?.text ?? envelope.rawText ?? "";
  return {
    id: `parsed-${envelope.id}`,
    rawDocumentId: envelope.rawContentRef ?? envelope.id,
    title: options?.title ?? envelope.fileName ?? envelope.sourceName ?? "Documento sin titulo",
    text,
    chunks: chunkText(text),
    language: envelope.language,
    extractedAt: new Date().toISOString(),
    extractionConfidence: options?.extractionConfidence ?? (text ? 68 : 20),
    needsOcr: options?.needsOcr ?? false,
    metadata: {
      inputType: envelope.inputType,
      sourceId: envelope.sourceId,
      ...envelope.rawMetadata,
      ...options?.metadata,
    },
  };
}
