import { prisma } from "@/lib/prisma";
import type {
  ArgusPredictionClassification,
  ArgusPredictionContext,
  ArgusPredictionInput,
} from "@/types/predictiveCore";

function emptyContext(inputId: string): ArgusPredictionContext {
  return {
    inputId,
    nearbyEvents: [],
    nearbyReports: [],
    relatedOfficialEvents: [],
    relatedOpenDataEvents: [],
    relatedCameras: [],
    weatherContext: null,
    historicalContext: [],
    routeContext: [],
    medicalContext: [],
    knowledgeFacts: [],
    sourceHealthContext: [],
  };
}

function hasCoordinates(input: ArgusPredictionInput) {
  return input.latitude !== undefined && input.longitude !== undefined;
}

function nearbyWhere(input: ArgusPredictionInput, degrees = 0.75) {
  if (!hasCoordinates(input)) return {};
  return {
    latitude: { gte: input.latitude! - degrees, lte: input.latitude! + degrees },
    longitude: { gte: input.longitude! - degrees, lte: input.longitude! + degrees },
  };
}

export async function getPredictionContext(
  input: ArgusPredictionInput,
  classification: ArgusPredictionClassification
): Promise<ArgusPredictionContext> {
  const context = emptyContext(input.id);

  try {
    const [reports, helpRequests, externalEvents, facts, sourceRuns] = await Promise.all([
      prisma.report.findMany({
        where: hasCoordinates(input) ? nearbyWhere(input) : {},
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      prisma.helpRequest.findMany({
        where: hasCoordinates(input) ? nearbyWhere(input) : {},
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.externalEvent.findMany({
        where: {
          ...(hasCoordinates(input) ? nearbyWhere(input) : {}),
          ...(classification.kind === "external_event" ? {} : { category: { contains: classification.kind } }),
        },
        orderBy: [{ occurredAt: "desc" }, { updatedAt: "desc" }],
        take: 12,
      }),
      prisma.hazardKnowledgeFact.findMany({
        where: {
          OR: [
            { hazardType: { contains: classification.kind } },
            { title: { contains: input.kind } },
            { summary: { contains: input.kind } },
          ],
        },
        orderBy: [{ relevanceScore: "desc" }, { confidence: "desc" }],
        take: 6,
      }),
      prisma.ingestionRun.findMany({
        where: input.sourceId ? { sourceId: input.sourceId } : undefined,
        orderBy: { fetchedAt: "desc" },
        take: 5,
      }),
    ]);

    context.nearbyReports = [...reports.filter((report) => report.id !== input.id), ...helpRequests];
    context.nearbyEvents = externalEvents.filter((event) => event.id !== input.id);
    context.relatedOfficialEvents = externalEvents.filter((event) =>
      ["usgs_earthquake", "noaa_tsunami", "nws", "senapred"].includes(event.sourceId)
    );
    context.relatedOpenDataEvents = externalEvents.filter((event) => !context.relatedOfficialEvents.includes(event));
    context.historicalContext = facts.filter((fact) => Boolean(fact.year || fact.eventDate));
    context.knowledgeFacts = facts;
    context.sourceHealthContext = sourceRuns;
  } catch {
    return context;
  }

  return context;
}
