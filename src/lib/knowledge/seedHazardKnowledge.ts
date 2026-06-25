import { Prisma } from "@prisma/client";
import {
  chileTsunamiHistoryDocument,
  chileTsunamiHistoryFacts,
} from "@/data/knowledge/chileTsunamiHistory";
import {
  additionalChileHazardFacts,
  chileHazardSourceRegistry,
} from "@/data/knowledge/chileHazardSourceRegistry";
import { disasterKnowledgeBase } from "@/data/knowledge/disasterKnowledgeBase";
import { prisma } from "@/lib/prisma";
import type {
  HazardKnowledgeDocumentSummary,
  HazardKnowledgeFact,
} from "@/types/hazardKnowledge";

const seededDocumentIds = new Set<string>();

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function documentData(document: HazardKnowledgeDocumentSummary) {
  const publishedYear = document.publishedYear;
  return {
    title: document.title,
    sourceName: document.sourceName,
    sourceUrl: document.sourceUrl,
    publisher: document.publisher,
    country: document.country ?? document.countryFocus,
    hazardType: document.hazardType,
    language: document.language,
    publishedYear,
    notes: document.notes,
    documentCategory: document.documentCategory,
    ingestionStatus: document.ingestionStatus ?? "queued",
    priority: document.priority ?? 3,
    reliabilityScore: document.reliabilityScore ?? 80,
    publicationYear: publishedYear,
    institution: document.institution ?? document.sourceName,
    countryFocus: document.countryFocus,
    regionFocus: document.regionFocus,
    hazardTypes: asJson(document.hazardTypes ?? [document.hazardType]),
    tags: asJson(document.tags ?? []),
    limitationNote:
      document.limitationNote ??
      "Fuente documental de contexto; no confirma eventos en vivo.",
  };
}

function factData(fact: HazardKnowledgeFact) {
  return {
    documentId: fact.documentId,
    hazardType: fact.hazardType,
    knowledgeType: fact.knowledgeType,
    title: fact.title,
    summary: fact.summary,
    country: fact.country,
    region: fact.region,
    latitude: fact.latitude,
    longitude: fact.longitude,
    year: fact.year,
    eventDate: toDate(fact.eventDate),
    magnitude: fact.magnitude,
    magnitudeLabel: fact.magnitudeLabel,
    depthKm: fact.depthKm,
    ruptureLengthKm: fact.ruptureLengthKm,
    maxSeaLevelVariationM: fact.maxSeaLevelVariationM,
    affectedCoastKm: fact.affectedCoastKm,
    casualtiesText: fact.casualtiesText,
    confidence: fact.confidence,
    tags: asJson(fact.tags),
    sourceName: fact.sourceName,
    sourceUrl: fact.sourceUrl,
    documentCategory: fact.documentCategory,
    relevanceScore: fact.relevanceScore ?? fact.confidence,
    limitationNote:
      fact.limitationNote ??
      "Contexto historico/doctrinal; no es alerta oficial actual.",
    extractionStatus: fact.extractionStatus ?? "manual_review",
  };
}

function doctrineDocuments(): HazardKnowledgeDocumentSummary[] {
  return disasterKnowledgeBase.map((card) => ({
    id: `doc-${card.id}`,
    title: `Doctrina ARGUS: ${card.eventType}`,
    sourceName: "ARGUS doctrinal seed",
    sourceUrl: "internal:argus-doctrine",
    hazardType: card.eventType.toLowerCase(),
    documentCategory: "doctrine",
    ingestionStatus: "seeded",
    priority: card.urgencyLevel === "critical" ? 1 : 2,
    reliabilityScore: card.confidenceLevel === "high" ? 82 : 70,
    hazardTypes: [card.eventType.toLowerCase()],
    tags: ["argus", "doctrine", "operational_rules"],
    notes: "Reglas operativas iniciales curadas desde prompt de producto.",
  }));
}

function doctrineFacts(): HazardKnowledgeFact[] {
  return disasterKnowledgeBase.map((card) => ({
    id: `fact-${card.id}`,
    documentId: `doc-${card.id}`,
    hazardType: card.eventType.toLowerCase() as HazardKnowledgeFact["hazardType"],
    knowledgeType: "doctrine",
    title: card.eventType,
    summary: `${card.basicDescription} Senales criticas: ${card.criticalSignals.join(
      "; "
    )}. Accion publica sugerida: ${card.suggestedPublicMessage}`,
    sourceName: "ARGUS doctrinal seed",
    sourceUrl: "internal:argus-doctrine",
    confidence: card.confidenceLevel === "high" ? 82 : 70,
    tags: ["argus", "doctrine", ...card.recommendedSources.map((source) => source.toLowerCase())],
    documentCategory: "doctrine",
    extractionStatus: "seeded",
    relevanceScore: card.urgencyLevel === "critical" ? 90 : 75,
  }));
}

export const hazardKnowledgeDocuments = [
  chileTsunamiHistoryDocument,
  ...chileHazardSourceRegistry,
  ...doctrineDocuments(),
];

export const hazardKnowledgeFacts = [
  ...chileTsunamiHistoryFacts,
  ...additionalChileHazardFacts,
  ...doctrineFacts(),
];

export async function seedChileTsunamiKnowledge() {
  return seedHazardKnowledge({
    documents: [chileTsunamiHistoryDocument],
    facts: chileTsunamiHistoryFacts,
  });
}

export async function seedChileHazardSourceRegistry() {
  return seedHazardKnowledge({
    documents: hazardKnowledgeDocuments,
    facts: hazardKnowledgeFacts,
  });
}

export async function seedHazardKnowledge(input?: {
  documents?: HazardKnowledgeDocumentSummary[];
  facts?: HazardKnowledgeFact[];
}) {
  const documents = input?.documents ?? hazardKnowledgeDocuments;
  const facts = input?.facts ?? hazardKnowledgeFacts;

  for (const document of documents) {
    await prisma.hazardKnowledgeDocument.upsert({
      where: { id: document.id },
      create: {
        id: document.id,
        ...documentData(document),
      },
      update: documentData(document),
    });
    seededDocumentIds.add(document.id);
  }

  for (const fact of facts) {
    if (fact.documentId && !seededDocumentIds.has(fact.documentId)) {
      const document = documents.find((item) => item.id === fact.documentId);
      if (document) {
        await prisma.hazardKnowledgeDocument.upsert({
          where: { id: document.id },
          create: {
            id: document.id,
            ...documentData(document),
          },
          update: documentData(document),
        });
        seededDocumentIds.add(document.id);
      }
    }

    await prisma.hazardKnowledgeFact.upsert({
      where: { id: fact.id },
      create: {
        id: fact.id,
        ...factData(fact),
      },
      update: factData(fact),
    });
  }

  return {
    documentCount: documents.length,
    factCount: facts.length,
  };
}
