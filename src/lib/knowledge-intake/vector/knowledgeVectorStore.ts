import { prisma } from "@/lib/prisma";
import { getKnowledgeIncidents } from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import type { ArgusIncidentKnowledge } from "@/types/knowledgeIntake";

function scoreText(query: string, text: string) {
  const terms = query.toLowerCase().split(/\W+/).filter((term) => term.length > 2);
  const haystack = text.toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 10 : 0), 0);
}

export async function searchSimilarChunks(query: string, limit = 5) {
  const chunks = await prisma.knowledgeDocumentChunk.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return chunks
    .map((chunk) => ({ chunk, score: scoreText(query, chunk.text) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function searchSimilarIncidents(input: { text?: string; domain?: string; limit?: number }) {
  const incidents = await getKnowledgeIncidents({
    domain: input.domain,
    limit: 100,
  });
  const query = input.text ?? input.domain ?? "";
  return incidents
    .map((incident) => ({
      incident,
      score: scoreText(query, `${incident.title} ${incident.summary} ${incident.domain}`),
    }))
    .filter((item) => item.score > 0 || input.domain)
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit ?? 5);
}

export async function getContextForIncident(incident: Pick<ArgusIncidentKnowledge, "title" | "summary" | "domain">) {
  const query = `${incident.title} ${incident.summary} ${incident.domain}`;
  const [chunks, incidents] = await Promise.all([
    searchSimilarChunks(query, 5),
    searchSimilarIncidents({ text: query, domain: incident.domain, limit: 5 }),
  ]);
  return {
    mode: "textual_fallback_pgvector_planned",
    chunks,
    incidents,
    limitations: ["No real embeddings are generated yet.", "pgvector integration is planned."],
  };
}
