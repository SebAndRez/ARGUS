import type { ArgusKnowledgeParsedDocument } from "@/types/knowledgeIntake";

export type DocumentChunkingOptions = {
  maxWords?: number;
  overlapWords?: number;
};

export type KnowledgeDocumentChunkInput = {
  chunkIndex: number;
  text: string;
  tokenEstimate: number;
  metadataJson: {
    documentId: string;
    sourceId?: string;
    title?: string;
    domain?: string;
    country?: string;
    documentType?: string;
  };
};

export function estimateTokens(text: string) {
  return Math.ceil(text.split(/\s+/).filter(Boolean).length * 1.35);
}

export function chunkText(text: string, options: DocumentChunkingOptions = {}) {
  const maxWords = options.maxWords ?? 1_000;
  const overlapWords = options.overlapWords ?? 120;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const chunks: string[] = [];
  let index = 0;
  while (index < words.length) {
    chunks.push(words.slice(index, index + maxWords).join(" "));
    index += Math.max(1, maxWords - overlapWords);
  }
  return chunks;
}

export function buildDocumentChunks(
  document: ArgusKnowledgeParsedDocument & {
    sourceId?: string;
    country?: string;
    domain?: string;
    documentType?: string;
  },
  options?: DocumentChunkingOptions
): KnowledgeDocumentChunkInput[] {
  return chunkText(document.text, options).map((text, index) => ({
    chunkIndex: index,
    text,
    tokenEstimate: estimateTokens(text),
    metadataJson: {
      documentId: document.id,
      sourceId: document.sourceId,
      title: document.title,
      domain: document.domain,
      country: document.country,
      documentType: document.documentType,
    },
  }));
}
