import { prisma } from "@/lib/prisma";
import type { ShelterPublicationStatus } from "@/lib/criticalPoi/shelterOperationalStatusTypes";

/**
 * Vigencia de los datos operacionales de un refugio, mismo patron de ventanas
 * TTL que `src/lib/vigia/incidentLifecycle.ts` pero por campo en vez de por
 * amenaza: la ocupacion envejece rapido, la capacidad fisica casi no cambia.
 *
 * Limitacion conocida: `CriticalPoiOperationalStatus` guarda un solo
 * `lastUpdatedAt` por fila (la fecha del ultimo reporte aplicado a la vista
 * resuelta), no una marca de tiempo independiente por campo. Cuando un
 * reporte solo trae ocupacion, `lastUpdatedAt` avanza igual para capacidad y
 * servicios aunque esos valores sigan siendo los de un reporte anterior. El
 * calculo de vigencia por campo es entonces conservador (usa el mismo
 * timestamp para todos los campos), lo que puede marcar como vigente un
 * campo que en la práctica no se ha vuelto a confirmar - preferible a
 * inventar una precision que no existe. Nunca se borra ni se pone en 0/false
 * un dato por vencimiento: solo se marca `isStale` y pierde prioridad.
 */

export type ShelterVigencyField = "occupancy" | "shelterStatus" | "services" | "capacity" | "address";

export const FIELD_TTL_HOURS: Record<ShelterVigencyField, number> = {
  occupancy: 6,
  shelterStatus: 24,
  services: 72,
  capacity: 336, // 14 dias
  address: 720, // 30 dias
};

/** Umbral que determina el flag `isStale` guardado en la fila: el campo mas volatil que la ficha realmente usa para operar (ocupacion). */
const PRIMARY_STALENESS_FIELD: ShelterVigencyField = "occupancy";

export function computeShelterStaleness(input: { lastUpdatedAt: Date; now?: Date }): {
  isStale: boolean;
  staleFields: ShelterVigencyField[];
} {
  const now = input.now ?? new Date();
  const hoursSinceUpdate = (now.getTime() - input.lastUpdatedAt.getTime()) / 3_600_000;

  const staleFields = (Object.keys(FIELD_TTL_HOURS) as ShelterVigencyField[]).filter(
    (field) => hoursSinceUpdate > FIELD_TTL_HOURS[field]
  );

  return {
    isStale: hoursSinceUpdate > FIELD_TTL_HOURS[PRIMARY_STALENESS_FIELD],
    staleFields,
  };
}

export type ShelterStalenessSweepSummary = { scanned: number; markedStale: number; markedFresh: number };

/**
 * Recalcula `isStale` para todos los refugios con estado operacional
 * registrado y persiste solo las filas que cambiaron. No toca `shelterStatus`
 * ni ningun otro campo de contenido - la vigencia demota, no borra.
 */
export async function sweepShelterStaleness(now: Date = new Date()): Promise<ShelterStalenessSweepSummary> {
  const rows = await prisma.criticalPoiOperationalStatus.findMany({
    select: { id: true, poiId: true, lastUpdatedAt: true, isStale: true },
  });

  let markedStale = 0;
  let markedFresh = 0;
  const updates: Array<() => Promise<unknown>> = [];

  for (const row of rows) {
    const { isStale } = computeShelterStaleness({ lastUpdatedAt: row.lastUpdatedAt, now });
    if (isStale === row.isStale) continue;
    if (isStale) markedStale += 1;
    else markedFresh += 1;
    updates.push(() =>
      prisma.$transaction([
        prisma.criticalPoiOperationalStatus.update({ where: { id: row.id }, data: { isStale } }),
        ...(isStale
          ? [
              prisma.criticalPoiStatusEvidence.create({
                data: {
                  poiId: row.poiId,
                  eventType: "marked_stale",
                  sourceType: "argus_estimate",
                  sourceName: "argus_staleness_sweep",
                  confidenceScore: 100,
                  payloadJson: { lastUpdatedAt: row.lastUpdatedAt.toISOString(), sweptAt: now.toISOString() },
                },
              }),
            ]
          : []),
      ])
    );
  }

  const CONCURRENCY = 6;
  const queue = [...updates];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let update = queue.shift(); update; update = queue.shift()) {
        await update();
      }
    })
  );

  return { scanned: rows.length, markedStale, markedFresh };
}

/**
 * Presencia en el listado de la fuente (distinto de `shelterStatus`, el
 * estado fisico del recinto). Umbrales configurables (spec ARGUS v1.0.3.5
 * §15): no visto en una corrida -> `missing`; no visto por varias corridas
 * -> `stale`; retirado despues del umbral mayor -> `archived`. Nunca se
 * borra el registro, solo pierde prioridad y se marca explicitamente.
 */
export const PUBLICATION_TTL_HOURS: Record<Exclude<ShelterPublicationStatus, "active">, number> = {
  missing: 24,
  stale: 72,
  archived: 720, // 30 dias
};

export function computePublicationStatus(input: { lastSeenAt: Date | null; now?: Date }): ShelterPublicationStatus {
  if (!input.lastSeenAt) return "active";
  const now = input.now ?? new Date();
  const hoursSinceSeen = (now.getTime() - input.lastSeenAt.getTime()) / 3_600_000;

  if (hoursSinceSeen > PUBLICATION_TTL_HOURS.archived) return "archived";
  if (hoursSinceSeen > PUBLICATION_TTL_HOURS.stale) return "stale";
  if (hoursSinceSeen > PUBLICATION_TTL_HOURS.missing) return "missing";
  return "active";
}

export type ShelterPublicationSweepSummary = {
  scanned: number;
  transitions: number;
  byStatus: Record<ShelterPublicationStatus, number>;
};

/**
 * Recalcula `publicationStatus` para todos los refugios con estado
 * operacional registrado, a partir de `CriticalPoi.lastSeenAt` (ya
 * actualizado por `upsertCriticalPois` en cada corrida de sincronizacion —
 * no requiere ningun cambio de esquema adicional). Solo persiste las filas
 * cuyo estado cambio; nunca borra ni archiva masivamente por si sola sin
 * pasar por esta ventana configurable.
 */
export async function sweepShelterPublicationStatus(now: Date = new Date()): Promise<ShelterPublicationSweepSummary> {
  const rows = await prisma.criticalPoiOperationalStatus.findMany({
    select: { id: true, poiId: true, publicationStatus: true, poi: { select: { lastSeenAt: true } } },
  });

  const byStatus: Record<ShelterPublicationStatus, number> = { active: 0, missing: 0, stale: 0, archived: 0 };
  let transitions = 0;
  const updates: Array<() => Promise<unknown>> = [];

  for (const row of rows) {
    const nextStatus = computePublicationStatus({ lastSeenAt: row.poi.lastSeenAt, now });
    byStatus[nextStatus] += 1;
    if (nextStatus === row.publicationStatus) continue;
    transitions += 1;
    updates.push(() =>
      prisma.$transaction([
        prisma.criticalPoiOperationalStatus.update({ where: { id: row.id }, data: { publicationStatus: nextStatus } }),
        prisma.criticalPoiStatusEvidence.create({
          data: {
            poiId: row.poiId,
            eventType: "source_updated",
            sourceType: "argus_estimate",
            sourceName: "argus_publication_sweep",
            confidenceScore: 100,
            payloadJson: { previousStatus: row.publicationStatus, nextStatus, sweptAt: now.toISOString() },
          },
        }),
      ])
    );
  }

  const CONCURRENCY = 6;
  const queue = [...updates];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let update = queue.shift(); update; update = queue.shift()) {
        await update();
      }
    })
  );

  return { scanned: rows.length, transitions, byStatus };
}
