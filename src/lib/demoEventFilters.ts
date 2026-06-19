import type {
  AlertLifecycleStatus,
  CrisisEvent,
  EventSeverity,
  EventType,
} from "@/types/crisis";

export type DemoSeverityFilter = "ALL" | EventSeverity;
export type DemoTypeFilter = "ALL" | EventType;
export type DemoLifecycleFilter = "ALL" | AlertLifecycleStatus;

export function filterEventsBySeverity(
  events: CrisisEvent[],
  severity: DemoSeverityFilter
) {
  return severity === "ALL"
    ? events
    : events.filter((event) => event.severity === severity);
}

export function filterEventsByType(events: CrisisEvent[], type: DemoTypeFilter) {
  return type === "ALL" ? events : events.filter((event) => event.type === type);
}

export function filterEventsByLifecycle(
  events: CrisisEvent[],
  lifecycle: DemoLifecycleFilter
) {
  return lifecycle === "ALL"
    ? events
    : events.filter((event) => event.lifecycleStatus === lifecycle);
}

export function sortEventsByPriority(events: CrisisEvent[]) {
  return [...events].sort((a, b) => {
    const priorityDifference = (b.priorityScore ?? 0) - (a.priorityScore ?? 0);
    if (priorityDifference !== 0) return priorityDifference;

    const confidenceDifference = (b.confidence ?? 0) - (a.confidence ?? 0);
    if (confidenceDifference !== 0) return confidenceDifference;

    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function limitVisibleEvents(events: CrisisEvent[], limit = 250) {
  return events.slice(0, Math.max(0, limit));
}

export interface NearbyCrisisEvent {
  event: CrisisEvent;
  distanceKm: number;
}

export function getEventDistanceKm(
  latitude: number,
  longitude: number,
  event: CrisisEvent
) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(event.latitude - latitude);
  const longitudeDelta = toRadians(event.longitude - longitude);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(latitude)) *
      Math.cos(toRadians(event.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function getNearbyEvents(
  events: CrisisEvent[],
  latitude: number,
  longitude: number,
  limit = 20
): NearbyCrisisEvent[] {
  return events
    .map((event) => ({
      event,
      distanceKm: getEventDistanceKm(latitude, longitude, event),
    }))
    .sort((a, b) => {
      const criticalDifference =
        Number(b.event.severity === "CRITICAL") - Number(a.event.severity === "CRITICAL");
      if (criticalDifference !== 0) return criticalDifference;

      const priorityDifference =
        (b.event.priorityScore ?? 0) - (a.event.priorityScore ?? 0);
      if (priorityDifference !== 0) return priorityDifference;

      const distanceDifference = a.distanceKm - b.distanceKm;
      if (distanceDifference !== 0) return distanceDifference;

      const recencyDifference =
        new Date(b.event.createdAt).getTime() - new Date(a.event.createdAt).getTime();
      if (recencyDifference !== 0) return recencyDifference;

      return (b.event.confidence ?? 0) - (a.event.confidence ?? 0);
    })
    .slice(0, Math.max(0, limit));
}
