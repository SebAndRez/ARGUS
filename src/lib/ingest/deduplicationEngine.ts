import type { ArgusNormalizedEvent } from "@/types/ingestion";

export interface DuplicateCandidate {
  leftId: string;
  rightId: string;
  similarity: number;
  reason: string;
}

export function normalizeExternalEventKey(event: Pick<ArgusNormalizedEvent, "sourceId" | "externalId">) {
  return `${event.sourceId}:${String(event.externalId).trim().toLowerCase()}`;
}

export function calculateEventSimilarity(a: ArgusNormalizedEvent, b: ArgusNormalizedEvent) {
  let score = 0;
  if (a.category === b.category) score += 30;
  if (distanceKm(a, b) <= 50) score += 30;
  if (distanceKm(a, b) <= 300) score += 15;
  if (Math.abs(Date.parse(a.occurredAt) - Date.parse(b.occurredAt)) <= 12 * 60 * 60 * 1000) score += 25;
  if (a.sourceId === b.sourceId && a.externalId === b.externalId) score = 100;
  return Math.min(100, score);
}

export function findPotentialDuplicates(events: ArgusNormalizedEvent[]) {
  const candidates: DuplicateCandidate[] = [];
  for (let i = 0; i < events.length; i += 1) {
    for (let j = i + 1; j < events.length; j += 1) {
      const similarity = calculateEventSimilarity(events[i], events[j]);
      if (similarity >= 75) {
        candidates.push({
          leftId: events[i].id,
          rightId: events[j].id,
          similarity,
          reason: "Cercania temporal/geografica/tipo; requiere confirmacion antes de fusionar.",
        });
      }
    }
  }
  return candidates;
}

export function mergeDuplicateEvents(events: ArgusNormalizedEvent[]) {
  const byKey = new Map<string, ArgusNormalizedEvent>();
  events.forEach((event) => {
    const key = normalizeExternalEventKey(event);
    const existing = byKey.get(key);
    if (!existing || Date.parse(event.updatedAt ?? event.occurredAt) > Date.parse(existing.updatedAt ?? existing.occurredAt)) {
      byKey.set(key, event);
    }
  });
  return Array.from(byKey.values());
}

export function buildDeduplicationSummary(events: ArgusNormalizedEvent[]) {
  const merged = mergeDuplicateEvents(events);
  const candidates = findPotentialDuplicates(merged);
  return {
    inputCount: events.length,
    exactDedupedCount: merged.length,
    exactDuplicatesRemoved: events.length - merged.length,
    potentialDuplicateCandidates: candidates.length,
    candidates,
  };
}

function distanceKm(a: ArgusNormalizedEvent, b: ArgusNormalizedEvent) {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return Number.POSITIVE_INFINITY;
  const earthRadiusKm = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(value));
}

function toRad(value: number) {
  return (value * Math.PI) / 180;
}
