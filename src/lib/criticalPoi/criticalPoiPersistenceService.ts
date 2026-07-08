import type { CriticalPoi as CriticalPoiRow, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  CriticalPoi,
  CriticalPoiBoundingBox,
  CriticalPoiCategory,
  CriticalPoiSource,
  CriticalPriority,
} from "@/lib/criticalPoi/criticalPoiTypes";

/**
 * Persistencia real de infraestructura critica (tabla `CriticalPoi`, ver
 * `prisma/schema.prisma` + `prisma/migrations/202607070001_add_critical_poi`).
 * Upsert por `[source, externalId]`, mismo patron que
 * `persistExternalEvents.ts` (upsert por `[sourceId, externalId]`): un
 * `Promise.all` de upserts individuales, no un job de dedup con similarity
 * matching (eso es para `KnowledgeIncident`, que resuelve texto libre; un POI
 * OSM ya trae un id estable).
 */

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);
}

function rowToCriticalPoi(row: CriticalPoiRow): CriticalPoi {
  return {
    id: row.id,
    externalId: row.externalId ?? undefined,
    source: row.source as CriticalPoiSource,
    name: row.name,
    category: row.category as CriticalPoiCategory,
    priority: row.priority as CriticalPriority,
    lat: row.latitude,
    lng: row.longitude,
    countryCode: row.countryCode ?? undefined,
    adminLevel1: row.adminLevel1 ?? undefined,
    adminLevel2: row.adminLevel2 ?? undefined,
    city: row.city ?? undefined,
    address: row.address ?? undefined,
    status: row.status as CriticalPoi["status"],
    confidence: row.confidence,
    lastSeenAt: row.lastSeenAt?.toISOString(),
    lastVerifiedAt: row.lastVerifiedAt?.toISOString(),
    tags: (row.tagsJson as Record<string, string> | null) ?? undefined,
    sourceUrl: row.sourceUrl ?? undefined,
    isPersistent: row.isPersistent,
    isVisibleByDefault: row.isVisibleByDefault,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type UpsertCriticalPoiInput = Omit<CriticalPoi, "id" | "createdAt" | "updatedAt">;

/** Upsert masivo por `[source, externalId]`. Entradas sin `externalId` (p.ej. manuales futuras) siempre crean fila nueva — Postgres no trata NULL como igual a NULL en el unique compuesto, es el comportamiento esperado para ese caso. */
export async function upsertCriticalPois(pois: UpsertCriticalPoiInput[]): Promise<{ upsertedCount: number; error: string | null }> {
  if (pois.length === 0) return { upsertedCount: 0, error: null };

  // Un sync de ciudad completa puede traer miles de elementos de Overpass;
  // Promise.all sobre todos a la vez satura el pool de conexiones de Postgres
  // (Supabase pooler, ~13 conexiones) y todo el batch falla por timeout. Se
  // procesa en tandas chicas y secuenciales entre si.
  const BATCH_SIZE = 8;
  let upsertedCount = 0;
  try {
    for (let start = 0; start < pois.length; start += BATCH_SIZE) {
      const batch = pois.slice(start, start + BATCH_SIZE);
      await Promise.all(
        batch.map((poi) =>
          prisma.criticalPoi.upsert({
            // Prisma's compound-unique upsert.where requires a defined value even though
            // externalId is nullable in the schema; "" is the placeholder for sources
            // without a stable external id (today only OSM is wired in, and OSM always
            // sets externalId, so this fallback is unreached in practice).
            where: {
              source_externalId: {
                source: poi.source,
                externalId: poi.externalId ?? "",
              },
            },
            create: {
              externalId: poi.externalId,
              source: poi.source,
              name: poi.name,
              category: poi.category,
              priority: poi.priority,
              latitude: poi.lat,
              longitude: poi.lng,
              countryCode: poi.countryCode,
              adminLevel1: poi.adminLevel1,
              adminLevel2: poi.adminLevel2,
              city: poi.city,
              address: poi.address,
              status: poi.status,
              confidence: poi.confidence,
              lastSeenAt: poi.lastSeenAt ? new Date(poi.lastSeenAt) : new Date(),
              lastVerifiedAt: poi.lastVerifiedAt ? new Date(poi.lastVerifiedAt) : undefined,
              tagsJson: toJson(poi.tags),
              sourceUrl: poi.sourceUrl,
              isPersistent: poi.isPersistent,
              isVisibleByDefault: poi.isVisibleByDefault,
            },
            update: {
              name: poi.name,
              category: poi.category,
              priority: poi.priority,
              latitude: poi.lat,
              longitude: poi.lng,
              countryCode: poi.countryCode,
              adminLevel1: poi.adminLevel1,
              adminLevel2: poi.adminLevel2,
              city: poi.city,
              address: poi.address,
              confidence: poi.confidence,
              lastSeenAt: poi.lastSeenAt ? new Date(poi.lastSeenAt) : new Date(),
              tagsJson: toJson(poi.tags),
              sourceUrl: poi.sourceUrl,
            },
          })
        )
      );
      upsertedCount += batch.length;
    }
    return { upsertedCount, error: null };
  } catch (error) {
    return { upsertedCount, error: error instanceof Error ? error.message : "Critical POI persistence failed." };
  }
}

export interface CriticalPoiQueryOptions {
  priorities?: CriticalPriority[];
  categories?: CriticalPoiCategory[];
  statuses?: CriticalPoi["status"][];
  limit?: number;
}

export async function getCriticalPoisInBbox(bbox: CriticalPoiBoundingBox, options: CriticalPoiQueryOptions = {}): Promise<CriticalPoi[]> {
  const rows = await prisma.criticalPoi.findMany({
    where: {
      latitude: { gte: bbox.south, lte: bbox.north },
      longitude: { gte: bbox.west, lte: bbox.east },
      ...(options.priorities?.length ? { priority: { in: options.priorities } } : {}),
      ...(options.categories?.length ? { category: { in: options.categories } } : {}),
      status: { in: options.statuses?.length ? options.statuses : ["active", "unknown", "temporary"] },
    },
    take: Math.min(options.limit ?? 500, 1000),
    orderBy: { priority: "asc" },
  });
  return rows.map(rowToCriticalPoi);
}

export async function getCriticalPoisNear(point: { lat: number; lng: number }, radiusKm: number, options: CriticalPoiQueryOptions = {}): Promise<CriticalPoi[]> {
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.max(Math.cos((point.lat * Math.PI) / 180), 0.2));
  return getCriticalPoisInBbox(
    { south: point.lat - latDelta, north: point.lat + latDelta, west: point.lng - lngDelta, east: point.lng + lngDelta },
    options
  );
}

export async function getCriticalPoiById(id: string): Promise<CriticalPoi | null> {
  const row = await prisma.criticalPoi.findUnique({ where: { id } });
  return row ? rowToCriticalPoi(row) : null;
}

export async function countCriticalPoisByCategory(bbox: CriticalPoiBoundingBox): Promise<Record<string, number>> {
  const rows = await prisma.criticalPoi.groupBy({
    by: ["category"],
    where: {
      latitude: { gte: bbox.south, lte: bbox.north },
      longitude: { gte: bbox.west, lte: bbox.east },
      status: { in: ["active", "unknown", "temporary"] },
    },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((row) => [row.category, row._count._all]));
}
