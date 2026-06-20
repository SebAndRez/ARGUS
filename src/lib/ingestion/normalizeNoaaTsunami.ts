import { getArgusSource } from "@/config/argusSourceRegistry";
import type {
  ArgusIngestionSeverity,
  ArgusNormalizedEvent,
  NoaaTsunamiAtomEntry,
} from "@/types/ingestion";

const RECOMMENDED_ACTION =
  "Revise instrucciones oficiales y evite zonas costeras si existe alerta activa.";

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

function getAlternateLink(entryXml: string) {
  const linkTags = entryXml.match(/<link\b[^>]*\/?>/gi) ?? [];

  for (const linkTag of linkTags) {
    const rel = linkTag.match(/\brel=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const href = linkTag.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (rel === "alternate" && href) return decodeXml(href);
  }

  return "";
}

function parseDate(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function parseCoordinate(value: string) {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

function getCoordinates(entryXml: string, summary: string) {
  const geoLatitude = parseCoordinate(getTagValue(entryXml, "geo:lat"));
  const geoLongitude = parseCoordinate(getTagValue(entryXml, "geo:long"));
  if (geoLatitude !== null && geoLongitude !== null) {
    return {
      latitude: geoLatitude,
      longitude: geoLongitude,
    };
  }

  const latLonMatch = summary.match(
    /Lat\/Lon:\s*(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)/i
  );
  if (!latLonMatch) {
    return {
      latitude: null,
      longitude: null,
    };
  }

  return {
    latitude: parseCoordinate(latLonMatch[1]),
    longitude: parseCoordinate(latLonMatch[2]),
  };
}

export function parseNoaaTsunamiAtom(xml: string) {
  const entryMatches = xml.match(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi) ?? [];
  const feedHeader = xml.split(/<entry(?:\s[^>]*)?>/i)[0] ?? "";
  const feedId = getTagValue(feedHeader, "id");
  const feedTitle = stripHtml(getTagValue(feedHeader, "title"));
  const sourceUpdatedAt = parseDate(getTagValue(feedHeader, "updated"));

  const entries: NoaaTsunamiAtomEntry[] = entryMatches.map((entryXml) => {
    const summary = stripHtml(
      getTagValue(entryXml, "summary") || getTagValue(entryXml, "content")
    );
    const coordinates = getCoordinates(entryXml, summary);

    return {
      feedId,
      feedTitle,
      id: getTagValue(entryXml, "id"),
      title: stripHtml(getTagValue(entryXml, "title")),
      updated: getTagValue(entryXml, "updated"),
      summary,
      link: getAlternateLink(entryXml),
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
    };
  });

  return {
    sourceUpdatedAt,
    entries,
  };
}

function getMessageType(entry: NoaaTsunamiAtomEntry) {
  const explicitCategory = entry.summary.match(
    /Category:\s*(Warning|Advisory|Watch|Threat|Information)\b/i
  )?.[1];
  if (explicitCategory) return explicitCategory.toLowerCase();

  const heading = `${entry.feedTitle} ${entry.title}`.toLowerCase();
  if (heading.includes("warning")) return "warning";
  if (heading.includes("advisory")) return "advisory";
  if (heading.includes("watch")) return "watch";
  if (heading.includes("threat")) return "threat";
  if (heading.includes("information")) return "information";
  return "unknown";
}

function getSeverity(messageType: string): ArgusIngestionSeverity {
  if (messageType === "warning") return "critical";
  if (messageType === "advisory" || messageType === "threat") return "high";
  if (messageType === "watch") return "medium";
  if (messageType === "information") return "low";
  return "medium";
}

export function normalizeNoaaTsunami(
  entry: NoaaTsunamiAtomEntry
): ArgusNormalizedEvent | null {
  const occurredAt = parseDate(entry.updated);
  const externalId = entry.id || `${entry.feedId}:${entry.updated}:${entry.title}`;
  if (!entry.title || !externalId || !occurredAt) return null;

  const source = getArgusSource("noaa_tsunami");
  const messageType = getMessageType(entry);
  const locationName = entry.title;

  return {
    id: `noaa-tsunami-${externalId.replace(/[^a-z0-9-]+/gi, "-")}`,
    sourceId: "noaa_tsunami",
    sourceName: source?.name ?? "NOAA Tsunami",
    externalId: `${entry.feedId}:${externalId}`,
    title: `${messageType.toUpperCase()} · ${entry.title}`,
    description: entry.summary || `Boletín NOAA Tsunami: ${entry.feedTitle}.`,
    category: "tsunami",
    severity: getSeverity(messageType),
    confidence: source?.reliabilityScore ?? 98,
    latitude: entry.latitude,
    longitude: entry.longitude,
    occurredAt,
    updatedAt: occurredAt,
    url: entry.link || null,
    rawMessageType: messageType,
    locationName,
    recommendedAction: RECOMMENDED_ACTION,
    whyItMatters: `Mensaje ${messageType.toUpperCase()} para ${locationName}, actualizado ${occurredAt}.`,
    isExternal: true,
  };
}
