import type { ArgusKnowledgeEmbeddingRecord } from "@/types/knowledgeIntake";

export type KnowledgeVectorQuery = {
  text: string;
  ownerType?: ArgusKnowledgeEmbeddingRecord["ownerType"];
  limit?: number;
};

export type KnowledgeVectorSearchResult = {
  record: ArgusKnowledgeEmbeddingRecord;
  score: number;
};

export function buildEmbeddingRecord(input: Omit<ArgusKnowledgeEmbeddingRecord, "vectorRef" | "provider" | "createdAt">): ArgusKnowledgeEmbeddingRecord {
  return {
    ...input,
    provider: "stub",
    vectorRef: `stub-vector:${input.ownerType}:${input.ownerId}`,
    createdAt: "2026-07-02T00:00:00.000Z",
  };
}

export function searchVectorIndex(records: ArgusKnowledgeEmbeddingRecord[], query: KnowledgeVectorQuery): KnowledgeVectorSearchResult[] {
  const terms = query.text.toLowerCase().split(/\W+/).filter(Boolean);
  return records
    .filter((record) => !query.ownerType || record.ownerType === query.ownerType)
    .map((record) => {
      const text = record.text.toLowerCase();
      const score = terms.reduce((total, term) => total + (text.includes(term) ? 12 : 0), 0);
      return { record, score: Math.min(100, score) };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, query.limit ?? 5);
}
