import { prisma } from "@/lib/prisma";
import type { GlobalThreatType } from "@/lib/vigia/threatClassifier";

/**
 * Ciclo de vida operacional de los incidentes Global Watch. No requiere
 * migración de esquema: el estado vive en `technicalFactorsJson.lifecycle`
 * y se recalcula en cada corrida del motor (sweep) y al leer para el mapa.
 *
 * Reglas:
 * - `new`: recién creado (primera corrida que lo ve).
 * - `active`: la fuente sigue reportándolo / actualización reciente.
 * - `monitoring`: sin actualización dentro de su ventana "activa".
 * - `contained`: la fuente oficial declara control (texto controlado/contained).
 * - `resolved`: sin actualizaciones más allá de la ventana de resolución.
 * - `archived`: resuelto hace más del doble de la ventana de resolución.
 */

export type IncidentLifecycle = "new" | "active" | "monitoring" | "contained" | "resolved" | "archived";

type LifecycleWindows = { activeHours: number; resolveHours: number };

/** Ventanas por amenaza: cuánto puede pasar sin actualización antes de degradar el estado. */
const LIFECYCLE_WINDOWS: Partial<Record<GlobalThreatType, LifecycleWindows>> & { default: LifecycleWindows } = {
  EARTHQUAKE: { activeHours: 6, resolveHours: 72 },
  TSUNAMI: { activeHours: 6, resolveHours: 24 },
  TORNADO: { activeHours: 6, resolveHours: 24 },
  WATERSPOUT: { activeHours: 6, resolveHours: 24 },
  SEVERE_WIND: { activeHours: 12, resolveHours: 48 },
  SEVERE_WEATHER: { activeHours: 12, resolveHours: 48 },
  WILDFIRE: { activeHours: 24, resolveHours: 168 },
  FLOOD: { activeHours: 48, resolveHours: 168 },
  LANDSLIDE: { activeHours: 24, resolveHours: 120 },
  VOLCANO: { activeHours: 48, resolveHours: 336 },
  CYCLONE: { activeHours: 24, resolveHours: 120 },
  HUMANITARIAN_CRISIS: { activeHours: 96, resolveHours: 720 },
  INFRASTRUCTURE_DAMAGE: { activeHours: 24, resolveHours: 120 },
  RESCUE_OPERATION: { activeHours: 24, resolveHours: 96 },
  CIVIL_UNREST: { activeHours: 24, resolveHours: 96 },
  default: { activeHours: 24, resolveHours: 120 },
};

const CONTAINED_PATTERN = /contained|controlad[oa]|extinguid[oa]|bajo\s+control|contenci[oó]n\s+completa/i;

export function detectContainedSignal(text: string): boolean {
  return CONTAINED_PATTERN.test(text);
}

export function computeLifecycle(input: {
  threat: GlobalThreatType;
  createdAt: Date;
  lastSourceUpdateAt: Date;
  /** true cuando la corrida actual volvió a ver el evento en la fuente. */
  seenInCurrentRun?: boolean;
  containedSignal?: boolean;
  now?: Date;
}): IncidentLifecycle {
  const now = input.now ?? new Date();
  const windows = LIFECYCLE_WINDOWS[input.threat] ?? LIFECYCLE_WINDOWS.default;
  if (input.containedSignal) return "contained";

  const hoursSinceUpdate = (now.getTime() - input.lastSourceUpdateAt.getTime()) / 3_600_000;
  const hoursSinceCreation = (now.getTime() - input.createdAt.getTime()) / 3_600_000;

  if (hoursSinceUpdate > windows.resolveHours * 2) return "archived";
  if (hoursSinceUpdate > windows.resolveHours) return "resolved";
  if (input.seenInCurrentRun || hoursSinceUpdate <= windows.activeHours) {
    return hoursSinceCreation <= 1 ? "new" : "active";
  }
  return "monitoring";
}

export type LifecycleSweepSummary = {
  scanned: number;
  transitions: number;
  byState: Record<IncidentLifecycle, number>;
};

/**
 * Recalcula el ciclo de vida de los incidentes recientes de las fuentes
 * VIGÍA y persiste el nuevo estado dentro de `technicalFactorsJson` cuando
 * cambió. Se ejecuta al final de cada corrida del motor.
 */
export async function sweepIncidentLifecycles(sourceIds: string[], resolveThreat: (incident: { domain: string; subtype: string | null }) => GlobalThreatType): Promise<LifecycleSweepSummary> {
  const since = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  const incidents = await prisma.knowledgeIncident.findMany({
    where: {
      sourceId: { in: sourceIds },
      updatedAt: { gte: since },
    },
    select: {
      id: true,
      domain: true,
      subtype: true,
      summary: true,
      createdAt: true,
      detectedAt: true,
      occurredAt: true,
      updatedAt: true,
      technicalFactorsJson: true,
    },
    take: 1000,
  });

  const byState: Record<IncidentLifecycle, number> = {
    new: 0,
    active: 0,
    monitoring: 0,
    contained: 0,
    resolved: 0,
    archived: 0,
  };
  let transitions = 0;

  const pendingUpdates: Array<() => Promise<unknown>> = [];
  for (const incident of incidents) {
    const technical = (incident.technicalFactorsJson as Record<string, unknown> | null) ?? {};
    const previous = typeof technical.lifecycle === "string" ? (technical.lifecycle as IncidentLifecycle) : undefined;
    const threat = resolveThreat({ domain: incident.domain, subtype: incident.subtype });
    const lifecycle = computeLifecycle({
      threat,
      createdAt: incident.createdAt,
      lastSourceUpdateAt: incident.detectedAt ?? incident.updatedAt,
      containedSignal: detectContainedSignal(incident.summary ?? ""),
    });
    byState[lifecycle] += 1;
    if (previous === lifecycle) continue;
    transitions += 1;
    pendingUpdates.push(() =>
      prisma.knowledgeIncident.update({
        where: { id: incident.id },
        data: {
          technicalFactorsJson: { ...technical, lifecycle, lifecycleUpdatedAt: new Date().toISOString() },
        },
      })
    );
  }

  // Lotes concurrentes acotados: la BD es remota y una primera corrida
  // puede transicionar cientos de incidentes a la vez.
  const CONCURRENCY = 6;
  const queue = [...pendingUpdates];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let update = queue.shift(); update; update = queue.shift()) {
        await update();
      }
    })
  );

  return { scanned: incidents.length, transitions, byState };
}
