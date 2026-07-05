import { prisma } from "@/lib/prisma";

type ContextEvidenceInput = {
  incidentId?: string;
  sourceId: string;
  sourceName: string;
  evidenceType: string;
  title: string;
  url?: string;
  excerpt: string;
  rawRef: string;
  confidenceScore: number;
  metadataJson: unknown;
};

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null));
}

export async function saveContextEvidenceIfNew(input: ContextEvidenceInput) {
  const existing = await prisma.knowledgeEvidence.findFirst({
    where: {
      sourceId: input.sourceId,
      evidenceType: input.evidenceType,
      rawRef: input.rawRef,
      ...(input.incidentId ? { incidentId: input.incidentId } : {}),
    },
  });
  if (existing) return { action: "skipped" as const, evidence: existing };
  const evidence = await prisma.knowledgeEvidence.create({
    data: {
      incidentId: input.incidentId,
      sourceId: input.sourceId,
      sourceName: input.sourceName,
      evidenceType: input.evidenceType,
      title: input.title,
      url: input.url,
      excerpt: input.excerpt,
      rawRef: input.rawRef,
      confidenceScore: input.confidenceScore,
      metadataJson: toJson(input.metadataJson),
    },
  });
  return { action: "inserted" as const, evidence };
}
