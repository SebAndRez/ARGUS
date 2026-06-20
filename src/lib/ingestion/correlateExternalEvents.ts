import type { ArgusCorrelatedIncident } from "@/types/correlation";
import type {
  ArgusIngestionSeverity,
  ArgusNormalizedEvent,
} from "@/types/ingestion";

const EARTH_RADIUS_KM = 6_371;
const SEVERITY_RANK: Record<ArgusIngestionSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function hasCoordinates(event: ArgusNormalizedEvent) {
  return (
    typeof event.latitude === "number" &&
    Number.isFinite(event.latitude) &&
    typeof event.longitude === "number" &&
    Number.isFinite(event.longitude)
  );
}

function eventTimestamp(event: ArgusNormalizedEvent) {
  const timestamp = Date.parse(event.occurredAt);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function maxSeverity(events: ArgusNormalizedEvent[]): ArgusIngestionSeverity {
  return events.reduce<ArgusIngestionSeverity>(
    (highest, event) =>
      SEVERITY_RANK[event.severity] > SEVERITY_RANK[highest]
        ? event.severity
        : highest,
    "low"
  );
}

function correlationTimestampLabel(events: ArgusNormalizedEvent[]) {
  const latestTimestamp = Math.max(
    ...events
      .map(eventTimestamp)
      .filter((timestamp): timestamp is number => timestamp !== null)
  );
  if (!Number.isFinite(latestTimestamp)) return "Fecha no disponible";

  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(latestTimestamp));
}

function buildCorrelationId(
  kind: ArgusCorrelatedIncident["kind"],
  events: ArgusNormalizedEvent[]
) {
  return `${kind}:${events
    .map((event) => event.id)
    .sort()
    .join(":")}`;
}

function createCorrelation(
  input: Omit<ArgusCorrelatedIncident, "id" | "sourceIds" | "severity" | "createdAtLabel">
): ArgusCorrelatedIncident {
  const events = [input.primaryEvent, ...input.relatedEvents];

  return {
    ...input,
    id: buildCorrelationId(input.kind, events),
    sourceIds: Array.from(new Set(events.map((event) => event.sourceId))),
    severity: maxSeverity(events),
    createdAtLabel: correlationTimestampLabel(events),
  };
}

export function distanceKm(
  first: ArgusNormalizedEvent,
  second: ArgusNormalizedEvent
): number | null {
  if (!hasCoordinates(first) || !hasCoordinates(second)) return null;

  const firstLatitude = toRadians(first.latitude as number);
  const secondLatitude = toRadians(second.latitude as number);
  const latitudeDelta = secondLatitude - firstLatitude;
  const longitudeDelta = toRadians(
    (second.longitude as number) - (first.longitude as number)
  );
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(haversine));
}

export function isNearInTime(
  first: ArgusNormalizedEvent,
  second: ArgusNormalizedEvent,
  hours: number
) {
  const firstTimestamp = eventTimestamp(first);
  const secondTimestamp = eventTimestamp(second);
  if (firstTimestamp === null || secondTimestamp === null) return false;

  return Math.abs(firstTimestamp - secondTimestamp) <= hours * 60 * 60 * 1_000;
}

export function isNearInSpace(
  first: ArgusNormalizedEvent,
  second: ArgusNormalizedEvent,
  kilometers: number
) {
  const distance = distanceKm(first, second);
  return distance !== null && distance <= kilometers;
}

export function correlateExternalEvents(
  events: ArgusNormalizedEvent[]
): ArgusCorrelatedIncident[] {
  const usgsEvents = events.filter(
    (event) => event.sourceId === "usgs_earthquake"
  );
  const gdacsEarthquakes = events.filter(
    (event) => event.sourceId === "gdacs" && event.category === "earthquake"
  );
  const gdacsRelatedHazards = events.filter(
    (event) =>
      event.sourceId === "gdacs" &&
      (event.category === "earthquake" || event.category === "tsunami")
  );
  const noaaEvents = events.filter(
    (event) => event.sourceId === "noaa_tsunami"
  );
  const correlations: ArgusCorrelatedIncident[] = [];
  const usedGdacsEarthquakeIds = new Set<string>();

  usgsEvents.forEach((usgsEvent) => {
    const bestGdacsMatch = gdacsEarthquakes
      .filter(
        (gdacsEvent) =>
          !usedGdacsEarthquakeIds.has(gdacsEvent.id) &&
          isNearInTime(usgsEvent, gdacsEvent, 12) &&
          isNearInSpace(usgsEvent, gdacsEvent, 300)
      )
      .map((gdacsEvent) => {
        const distance = distanceKm(usgsEvent, gdacsEvent) ?? 300;
        const timeDeltaHours =
          Math.abs(
            (eventTimestamp(usgsEvent) ?? 0) -
              (eventTimestamp(gdacsEvent) ?? 0)
          ) /
          (60 * 60 * 1_000);
        return {
          event: gdacsEvent,
          distance,
          score: distance + timeDeltaHours * 10,
        };
      })
      .sort((left, right) => left.score - right.score)[0];

    if (bestGdacsMatch) {
      usedGdacsEarthquakeIds.add(bestGdacsMatch.event.id);
      const distance = bestGdacsMatch.distance;
      const confidence = distance <= 100 ? 94 : distance <= 200 ? 89 : 84;
      correlations.push(
        createCorrelation({
          title: `Posible mismo terremoto · ${
            usgsEvent.locationName ?? usgsEvent.title
          }`,
          kind: "official_confirmation",
          primaryEvent: usgsEvent,
          relatedEvents: [bestGdacsMatch.event],
          confidence,
          explanation:
            "USGS y GDACS publicaron terremotos cercanos en tiempo y espacio. Esto constituye una posible confirmación cruzada, no una certeza de identidad.",
          recommendedAction:
            "Compare ambos reportes oficiales y mantenga el seguimiento de actualizaciones.",
        })
      );
    }

    if (typeof usgsEvent.rawMagnitude !== "number" || usgsEvent.rawMagnitude < 6.5) {
      return;
    }

    const relatedNoaaEvents = noaaEvents.filter((noaaEvent) => {
      if (!isNearInTime(usgsEvent, noaaEvent, 24)) return false;
      const spatialDistance = distanceKm(usgsEvent, noaaEvent);
      return spatialDistance === null || spatialDistance <= 1_500;
    });

    if (relatedNoaaEvents.length > 0) {
      const distances = relatedNoaaEvents
        .map((event) => distanceKm(usgsEvent, event))
        .filter((distance): distance is number => distance !== null);
      const nearestDistance =
        distances.length > 0 ? Math.min(...distances) : null;

      correlations.push(
        createCorrelation({
          title: `Posible riesgo tsunami asociado · ${
            usgsEvent.locationName ?? usgsEvent.title
          }`,
          kind: "earthquake_tsunami",
          primaryEvent: usgsEvent,
          relatedEvents: relatedNoaaEvents,
          confidence:
            nearestDistance === null ? 68 : nearestDistance <= 500 ? 90 : 80,
          explanation:
            nearestDistance === null
              ? "Un terremoto USGS M6.5+ y boletines NOAA aparecen dentro de 24 horas. NOAA no aporta coordenadas para esta comparación, por lo que la relación es temporal y de confianza media."
              : "Un terremoto USGS M6.5+ y boletines NOAA aparecen próximos en tiempo y ubicación. Es un posible riesgo asociado sujeto al mensaje oficial NOAA.",
          recommendedAction:
            "Revise los boletines NOAA y siga exclusivamente las instrucciones oficiales para zonas costeras.",
        })
      );
    }
  });

  const bestGdacsNoaaMatch = gdacsRelatedHazards
    .flatMap((gdacsEvent) =>
      noaaEvents
        .filter((noaaEvent) => {
          if (!isNearInTime(gdacsEvent, noaaEvent, 24)) return false;
          const spatialDistance = distanceKm(gdacsEvent, noaaEvent);
          return spatialDistance === null || spatialDistance <= 1_000;
        })
        .map((noaaEvent) => {
          const spatialDistance = distanceKm(gdacsEvent, noaaEvent);
          const timeDeltaHours =
            Math.abs(
              (eventTimestamp(gdacsEvent) ?? 0) -
                (eventTimestamp(noaaEvent) ?? 0)
            ) /
            (60 * 60 * 1_000);
          return {
            gdacsEvent,
            noaaEvent,
            spatialDistance,
            score: (spatialDistance ?? 800) + timeDeltaHours * 10,
          };
        })
    )
    .sort((left, right) => left.score - right.score)[0];

  if (bestGdacsNoaaMatch) {
    correlations.push(
      createCorrelation({
        title: "Posible riesgo costero relacionado",
        kind: "related_hazard",
        primaryEvent: bestGdacsNoaaMatch.gdacsEvent,
        relatedEvents: [bestGdacsNoaaMatch.noaaEvent],
        confidence: bestGdacsNoaaMatch.spatialDistance === null ? 64 : 78,
        explanation:
          "GDACS y NOAA publicaron señales de terremoto o tsunami cercanas en tiempo. La coincidencia sugiere un riesgo asociado que requiere confirmación oficial.",
        recommendedAction:
          "Contraste ambos boletines y priorice las instrucciones vigentes de NOAA y autoridades locales.",
      })
    );
  }

  return Array.from(
    new Map(correlations.map((correlation) => [correlation.id, correlation])).values()
  ).sort((left, right) => right.confidence - left.confidence);
}
