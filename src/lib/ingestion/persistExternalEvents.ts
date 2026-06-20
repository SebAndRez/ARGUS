import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ArgusCorrelatedIncident } from "@/types/correlation";
import type {
  ArgusExternalSourceId,
  ArgusNormalizedEvent,
} from "@/types/ingestion";

type PersistenceResult = {
  persistedCount: number;
  error: string | null;
};

function dateOrNull(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function persistExternalEvents(
  sourceId: ArgusExternalSourceId,
  events: ArgusNormalizedEvent[],
  options?: {
    fetchedAt?: string;
    expiresAt?: string;
    raw?: unknown;
  }
): Promise<PersistenceResult> {
  try {
    const now = new Date();
    const fetchedAt = dateOrNull(options?.fetchedAt) ?? now;
    const expiresAt = dateOrNull(options?.expiresAt);

    await Promise.all(
      events.map((event) =>
        prisma.externalEvent.upsert({
          where: {
            sourceId_externalId: {
              sourceId,
              externalId: event.externalId,
            },
          },
          create: {
            sourceId,
            externalId: event.externalId,
            category: event.category,
            title: event.title,
            description: event.description,
            severity: event.severity,
            confidence: event.confidence,
            latitude: event.latitude,
            longitude: event.longitude,
            locationName: event.locationName,
            country: event.country,
            sourceUrl: event.url,
            occurredAt: dateOrNull(event.occurredAt),
            fetchedAt,
            lastSeenAt: now,
            expiresAt,
            raw:
              options?.raw === undefined ? undefined : asJson(options.raw),
            normalized: asJson(event),
          },
          update: {
            category: event.category,
            title: event.title,
            description: event.description,
            severity: event.severity,
            confidence: event.confidence,
            latitude: event.latitude,
            longitude: event.longitude,
            locationName: event.locationName,
            country: event.country,
            sourceUrl: event.url,
            occurredAt: dateOrNull(event.occurredAt),
            fetchedAt,
            lastSeenAt: now,
            expiresAt,
            raw:
              options?.raw === undefined ? undefined : asJson(options.raw),
            normalized: asJson(event),
          },
        })
      )
    );

    return { persistedCount: events.length, error: null };
  } catch (error) {
    return {
      persistedCount: 0,
      error:
        error instanceof Error
          ? error.message
          : "External event persistence failed.",
    };
  }
}

export async function recordIngestionRun(
  sourceId: ArgusExternalSourceId,
  status: string,
  metadata?: {
    count?: number;
    cached?: boolean;
    error?: string | null;
    durationMs?: number;
    metadata?: unknown;
  }
) {
  try {
    return await prisma.ingestionRun.create({
      data: {
        sourceId,
        status,
        completedAt: new Date(),
        count: metadata?.count,
        cached: metadata?.cached ?? false,
        error: metadata?.error,
        durationMs: metadata?.durationMs,
        metadata:
          metadata?.metadata === undefined
            ? undefined
            : asJson(metadata.metadata),
      },
    });
  } catch {
    return null;
  }
}

export async function persistFreshIngestion(
  sourceId: ArgusExternalSourceId,
  events: ArgusNormalizedEvent[],
  options: {
    fetchedAt: string;
    expiresAt: string;
    startedAt: number;
  }
) {
  const persistence = await persistExternalEvents(sourceId, events, options);
  const run = await recordIngestionRun(sourceId, "success", {
    count: events.length,
    cached: false,
    durationMs: Date.now() - options.startedAt,
    metadata: {
      persistedCount: persistence.persistedCount,
      persistenceError: persistence.error,
    },
  });

  return {
    persistedCount: persistence.persistedCount,
    ingestionRunId: run?.id ?? null,
  };
}

export async function persistCorrelations(
  correlations: ArgusCorrelatedIncident[]
) {
  if (correlations.length === 0) {
    return { persistedCount: 0, error: null };
  }

  try {
    await prisma.externalEventCorrelation.createMany({
      data: correlations.map((correlation) => ({
        kind: correlation.kind,
        confidence: correlation.confidence,
        explanation: correlation.explanation,
        sourceIds: asJson(correlation.sourceIds),
        eventIds: asJson([
          correlation.primaryEvent.id,
          ...correlation.relatedEvents.map((event) => event.id),
        ]),
        metadata: asJson({
          title: correlation.title,
          severity: correlation.severity,
          recommendedAction: correlation.recommendedAction,
        }),
      })),
    });
    return { persistedCount: correlations.length, error: null };
  } catch (error) {
    return {
      persistedCount: 0,
      error:
        error instanceof Error ? error.message : "Correlation persistence failed.",
    };
  }
}
