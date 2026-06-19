import type { CrisisEvent, EventSeverity } from "@/types/crisis";

export interface EventCluster {
  id: string;
  latitude: number;
  longitude: number;
  count: number;
  highestSeverity: EventSeverity;
  priorityScore: number;
  events: CrisisEvent[];
}

const severityRank: Record<EventSeverity, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export function clusterEventsByGrid(
  events: CrisisEvent[],
  cellSize = 0.018
): EventCluster[] {
  const cells = new Map<string, CrisisEvent[]>();

  events.forEach((event) => {
    const latitude = Number(event.latitude);
    const longitude = Number(event.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    const latitudeCell = Math.floor(latitude / cellSize);
    const longitudeCell = Math.floor(longitude / cellSize);
    const key = `${latitudeCell}:${longitudeCell}`;
    const cellEvents = cells.get(key) ?? [];
    cellEvents.push(event);
    cells.set(key, cellEvents);
  });

  return Array.from(cells.entries()).map(([key, cellEvents]) => {
    const latitude =
      cellEvents.reduce((sum, event) => sum + event.latitude, 0) / cellEvents.length;
    const longitude =
      cellEvents.reduce((sum, event) => sum + event.longitude, 0) / cellEvents.length;
    const highestSeverity = cellEvents.reduce<EventSeverity>(
      (highest, event) =>
        severityRank[event.severity] > severityRank[highest] ? event.severity : highest,
      "LOW"
    );
    const priorityScore = Math.max(
      ...cellEvents.map((event) => event.priorityScore ?? 0)
    );
    const sortedEvents = [...cellEvents].sort(
      (a, b) =>
        (b.priorityScore ?? 0) - (a.priorityScore ?? 0) ||
        (b.confidence ?? 0) - (a.confidence ?? 0)
    );

    return {
      id: `event-cluster-${key}`,
      latitude,
      longitude,
      count: cellEvents.length,
      highestSeverity,
      priorityScore,
      events: sortedEvents,
    };
  });
}
