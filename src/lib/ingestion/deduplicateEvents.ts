import type { ArgusNormalizedEvent } from "@/types/ingestion";

function getEventTimestamp(event: ArgusNormalizedEvent) {
  const updatedTimestamp = event.updatedAt ? Date.parse(event.updatedAt) : Number.NaN;
  if (Number.isFinite(updatedTimestamp)) return updatedTimestamp;

  const occurredTimestamp = Date.parse(event.occurredAt);
  return Number.isFinite(occurredTimestamp) ? occurredTimestamp : 0;
}

export function deduplicateEvents(
  events: ArgusNormalizedEvent[]
): ArgusNormalizedEvent[] {
  const uniqueEvents = new Map<string, ArgusNormalizedEvent>();

  events.forEach((event) => {
    const key = `${event.sourceId}:${event.externalId}`;
    const current = uniqueEvents.get(key);

    if (!current || getEventTimestamp(event) > getEventTimestamp(current)) {
      uniqueEvents.set(key, event);
    }
  });

  return Array.from(uniqueEvents.values()).sort(
    (left, right) => getEventTimestamp(right) - getEventTimestamp(left)
  );
}
