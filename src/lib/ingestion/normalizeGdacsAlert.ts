import { getArgusSource } from "@/config/argusSourceRegistry";
import {
  classifySeismicEvent,
  estimateMercalliFromMagnitude,
  formatMagnitudeLabel,
  formatMagnitudePhrase,
  formatMercalliLabel,
} from "@/lib/seismicLabels";
import type {
  ArgusExternalAlertLevel,
  ArgusIngestionCategory,
  ArgusIngestionSeverity,
  ArgusNormalizedEvent,
  GdacsRssItem,
} from "@/types/ingestion";

const RECOMMENDED_ACTION =
  "Revise fuentes oficiales y manténgase atento a actualizaciones de emergencia.";

const EVENT_TYPE_CATEGORIES: Record<string, ArgusIngestionCategory> = {
  EQ: "earthquake",
  FL: "flood",
  TC: "cyclone",
  VO: "volcano",
  DR: "drought",
  WF: "wildfire",
};

const CATEGORY_LABELS: Partial<Record<ArgusIngestionCategory, string>> = {
  earthquake: "terremoto",
  flood: "inundación",
  cyclone: "ciclón",
  volcano: "actividad volcánica",
  drought: "sequía",
  wildfire: "incendio forestal",
  unknown: "desastre",
};

function decodeXml(value: string) {
  return value
    .replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i, "$1")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16))
    )
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function stripHtml(value: string) {
  return decodeXml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getTagValue(xml: string, tagName: string) {
  const tag = escapeRegExp(tagName);
  const match = xml.match(
    new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i")
  );
  return match ? decodeXml(match[1]) : "";
}

function parseDate(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function parseCoordinate(value: string) {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

function parseItem(itemXml: string): GdacsRssItem {
  const geoRssPoint = getTagValue(itemXml, "georss:point")
    .split(/\s+/)
    .map(Number);
  const latitude =
    parseCoordinate(getTagValue(itemXml, "geo:lat")) ??
    (Number.isFinite(geoRssPoint[0]) ? geoRssPoint[0] : null);
  const longitude =
    parseCoordinate(getTagValue(itemXml, "geo:long")) ??
    (Number.isFinite(geoRssPoint[1]) ? geoRssPoint[1] : null);

  return {
    title: stripHtml(getTagValue(itemXml, "title")),
    description: stripHtml(getTagValue(itemXml, "description")),
    link: getTagValue(itemXml, "link"),
    guid: getTagValue(itemXml, "guid"),
    pubDate: getTagValue(itemXml, "pubDate"),
    dateModified: getTagValue(itemXml, "gdacs:datemodified"),
    eventType: getTagValue(itemXml, "gdacs:eventtype").toUpperCase(),
    alertLevel: getTagValue(itemXml, "gdacs:alertlevel").toLowerCase(),
    eventId: getTagValue(itemXml, "gdacs:eventid"),
    country: stripHtml(getTagValue(itemXml, "gdacs:country")),
    latitude,
    longitude,
  };
}

export function parseGdacsRss(xml: string) {
  const itemMatches = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) ?? [];
  const channelHeader = xml.split(/<item(?:\s[^>]*)?>/i)[0] ?? "";

  return {
    sourceUpdatedAt: parseDate(getTagValue(channelHeader, "pubDate")),
    items: itemMatches.map(parseItem),
  };
}

function getCategory(item: GdacsRssItem): ArgusIngestionCategory {
  const category = EVENT_TYPE_CATEGORIES[item.eventType];
  if (category) return category;

  const text = `${item.title} ${item.description}`.toLowerCase();
  if (text.includes("earthquake")) return "earthquake";
  if (text.includes("flood")) return "flood";
  if (text.includes("cyclone") || text.includes("hurricane") || text.includes("typhoon")) {
    return "cyclone";
  }
  if (text.includes("volcano")) return "volcano";
  if (text.includes("drought")) return "drought";
  if (text.includes("wildfire") || text.includes("forest fire")) return "wildfire";
  return "unknown";
}

function getAlertLevel(value: string): ArgusExternalAlertLevel {
  if (value === "green" || value === "orange" || value === "red") return value;
  return "unknown";
}

function getSeverity(level: ArgusExternalAlertLevel): ArgusIngestionSeverity {
  if (level === "red") return "critical";
  if (level === "orange") return "high";
  if (level === "green") return "low";
  return "medium";
}

function getMagnitude(item: GdacsRssItem) {
  if (item.eventType !== "EQ") return null;
  const text = `${item.title} ${item.description}`;
  const match =
    text.match(/magnitude\s*:?\s*(\d+(?:\.\d+)?)/i) ??
    text.match(/\b(\d+(?:\.\d+)?)\s*M\b/i);
  if (!match) return null;
  const magnitude = Number(match[1]);
  return Number.isFinite(magnitude) ? magnitude : null;
}

function getDepthKm(item: GdacsRssItem) {
  if (item.eventType !== "EQ") return null;
  const match = `${item.title} ${item.description}`.match(
    /(?:depth|profundidad)\s*:?\s*(\d+(?:\.\d+)?)\s*km/i
  );
  if (!match) return null;
  const depth = Number(match[1]);
  return Number.isFinite(depth) ? depth : null;
}

const ALERT_LEVEL_LABELS: Record<ArgusExternalAlertLevel, string> = {
  green: "atención baja",
  orange: "atención alta",
  red: "atención crítica",
  unknown: "atención no especificada",
};

export function normalizeGdacsAlert(
  item: GdacsRssItem
): ArgusNormalizedEvent | null {
  if (
    !item.title ||
    item.latitude === null ||
    item.longitude === null ||
    !Number.isFinite(item.latitude) ||
    !Number.isFinite(item.longitude)
  ) {
    return null;
  }

  const occurredAt = parseDate(item.pubDate);
  if (!occurredAt) return null;

  const externalId = item.eventId || item.guid || item.link;
  if (!externalId) return null;

  const source = getArgusSource("gdacs");
  const category = getCategory(item);
  const alertLevel = getAlertLevel(item.alertLevel);
  const locationName = item.country || "ubicación no especificada";
  const categoryLabel = CATEGORY_LABELS[category] ?? "desastre";
  const magnitude = getMagnitude(item);
  const depthKm = getDepthKm(item);
  const isEarthquake = category === "earthquake" && magnitude !== null;
  const classification = isEarthquake
    ? classifySeismicEvent(magnitude)
    : null;
  const magnitudeLabel = isEarthquake
    ? formatMagnitudeLabel(magnitude)
    : null;
  const magnitudePhrase = isEarthquake
    ? formatMagnitudePhrase(magnitude)
    : null;
  const mercalliLabel = isEarthquake
    ? formatMercalliLabel(
        null,
        estimateMercalliFromMagnitude(magnitude, depthKm)
      )
    : null;
  const seismicDescription =
    isEarthquake && classification && magnitudePhrase && mercalliLabel
      ? `${classification} de ${magnitudePhrase} en ${locationName}. ${
          depthKm !== null
            ? `Profundidad: ${depthKm.toFixed(1)} km.`
            : "Profundidad no informada."
        } ${mercalliLabel}.`
      : null;

  return {
    id: `gdacs-${externalId}`,
    sourceId: "gdacs",
    sourceName: source?.name ?? "GDACS Global Disaster Alerts",
    externalId,
    title:
      isEarthquake && classification && magnitudeLabel
        ? `${classification} · ${magnitudeLabel} · ${locationName}`
        : item.title,
    description:
      seismicDescription ||
      item.description ||
      `Alerta GDACS de ${categoryLabel}.`,
    category,
    severity: getSeverity(alertLevel),
    confidence: source?.reliabilityScore ?? 94,
    latitude: item.latitude,
    longitude: item.longitude,
    occurredAt,
    updatedAt: parseDate(item.dateModified),
    url: item.link || null,
    rawMagnitude: magnitude,
    rawMagnitudeType: null,
    rawDepthKm: depthKm,
    rawAlertLevel: alertLevel,
    locationName,
    recommendedAction: RECOMMENDED_ACTION,
    whyItMatters:
      seismicDescription ||
      `${categoryLabel} con ${ALERT_LEVEL_LABELS[alertLevel]} GDACS en ${locationName}.`,
    isExternal: true,
  };
}
