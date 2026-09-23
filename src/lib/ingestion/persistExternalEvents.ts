import { Prisma, type IngestionRun } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { shadowWriteAfterLegacyWrite } from "@/lib/database-target/shadow-write/legacyShadowSync";
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
  const persistedIds: string[] = [];
  try {
    const now = new Date();
    const fetchedAt = dateOrNull(options?.fetchedAt) ?? now;
    const expiresAt = dateOrNull(options?.expiresAt);

    const persisted = await Promise.all(
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

    persistedIds.push(...persisted.map((row) => row.id));
  } catch (error) {
    return {
      persistedCount: 0,
      error:
        error instanceof Error
          ? error.message
          : "External event persistence failed.",
    };
  }

  // Shadow write (Paso 5), deliberately OUTSIDE the try above: the legacy
  // upsert has committed and stays the source of truth, and nothing the target
  // side does may influence the result returned below. This mirrors those
  // exact rows into the target schema by calling the same SQL the Wave 030
  // backfill runs; it is a no-op that opens no connection while
  // ARGUS_TARGET_DB_SHADOW_WRITE_ENABLED is off, and it never throws.
  await shadowWriteAfterLegacyWrite("ExternalEvent", persistedIds);

  return { persistedCount: events.length, error: null };
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
  let run: IngestionRun | null = null;
  try {
    run = await prisma.ingestionRun.create({
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

  // Shadow write (Paso 5) — see persistExternalEvents above for the contract.
  await shadowWriteAfterLegacyWrite("IngestionRun", [run.id]);

  return run;
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
