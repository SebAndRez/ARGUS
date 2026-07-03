import type {
  ArgusInputKind,
  ArgusPredictionInput,
  ArgusSourceAuthority,
} from "@/types/predictiveCore";

type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" ? (value as AnyRecord) : {};
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function isoValue(value: unknown, fallback = new Date()) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return fallback.toISOString();
}

function kindFromCategory(category: string, fallback: ArgusInputKind): ArgusInputKind {
  const normalized = category.toLowerCase();
  if (normalized.includes("earthquake") || normalized.includes("sismo")) return "earthquake";
  if (normalized.includes("tsunami")) return "tsunami";
  if (normalized.includes("fire") || normalized.includes("wildfire") || normalized.includes("incendio")) return "fire";
  if (normalized.includes("weather") || normalized.includes("storm") || normalized.includes("clima")) return "weather";
  if (normalized.includes("flood") || normalized.includes("inund")) return "flood";
  if (normalized.includes("volcano") || normalized.includes("volcan")) return "volcano";
  if (normalized.includes("conflict") || normalized.includes("war")) return "conflict";
  if (normalized.includes("medical") || normalized.includes("medic")) return "medical";
  return fallback;
}

function sourceAuthorityFromSource(sourceId?: string, explicit?: unknown): ArgusSourceAuthority {
  const normalizedExplicit = stringValue(explicit).toLowerCase();
  if (
    ["official", "open_data", "citizen", "argus_estimate", "institutional", "system", "unknown"].includes(
      normalizedExplicit
    )
  ) {
    return normalizedExplicit as ArgusSourceAuthority;
  }

  const normalized = sourceId?.toLowerCase() ?? "";
  if (["usgs_earthquake", "noaa_tsunami", "nws", "senapred"].includes(normalized)) return "official";
  if (
    normalized.includes("noaa") ||
    normalized.includes("nasa") ||
    normalized.includes("gdacs") ||
    normalized.includes("reliefweb") ||
    normalized.includes("open")
  ) {
    return "open_data";
  }
  if (normalized.includes("argus")) return "argus_estimate";
  return "unknown";
}

export function normalizeReportToPredictionInput(report: unknown): ArgusPredictionInput {
  const value = asRecord(report);
  const category = stringValue(value.category, "citizen_report");
  return {
    id: stringValue(value.id, `report-${Date.now()}`),
    kind: kindFromCategory(category, "citizen_report"),
    sourceAuthority: "citizen",
    sourceId: "citizen_report",
    sourceName: "Reporte ciudadano",
    title: stringValue(value.title, "Reporte ciudadano en verificación"),
    summary: stringValue(value.description ?? value.summary),
    latitude: numberValue(value.latitude),
    longitude: numberValue(value.longitude),
    region: stringValue(value.locationText),
    occurredAt: isoValue(value.createdAt),
    receivedAt: isoValue(value.updatedAt ?? value.createdAt),
    severityHint: stringValue(value.severity),
    raw: report,
  };
}

export function normalizeSosToPredictionInput(sos: unknown): ArgusPredictionInput {
  const value = asRecord(sos);
  return {
    ...normalizeReportToPredictionInput(sos),
    id: stringValue(value.id, `sos-${Date.now()}`),
    kind: "sos",
    sourceName: "ARGUS SOS",
    title: stringValue(value.title, "Solicitud SOS en verificación"),
    severityHint: stringValue(value.priority ?? value.severity, "HIGH"),
  };
}

export function normalizeExternalEventToPredictionInput(event: unknown): ArgusPredictionInput {
  const value = asRecord(event);
  const sourceId = stringValue(value.sourceId, "external_event");
  const category = stringValue(value.category, "external_event");
  return {
    id: stringValue(value.id ?? value.externalId, `external-${Date.now()}`),
    kind: kindFromCategory(category, "external_event"),
    sourceAuthority: sourceAuthorityFromSource(sourceId, value.sourceAuthority),
    sourceId,
    sourceName: stringValue(value.sourceName, sourceId),
    title: stringValue(value.title, "Evento externo en vigilancia"),
    summary: stringValue(value.description ?? value.summary),
    latitude: numberValue(value.latitude),
    longitude: numberValue(value.longitude),
    region: stringValue(value.locationName ?? value.region),
    countryCode: stringValue(value.country ?? value.countryCode),
    occurredAt: isoValue(value.occurredAt ?? value.createdAt),
    receivedAt: isoValue(value.updatedAt ?? value.fetchedAt ?? value.createdAt),
    severityHint: stringValue(value.severity),
    raw: event,
  };
}

export function normalizeEventToPredictionInput(event: unknown): ArgusPredictionInput {
  const value = asRecord(event);
  const type = stringValue(value.type);
  if (type === "SOS") return normalizeSosToPredictionInput(event);
  if (type === "REPORT") return normalizeReportToPredictionInput(event);

  return {
    id: stringValue(value.id, `event-${Date.now()}`),
    kind: kindFromCategory(stringValue(value.category ?? type, "system"), "system"),
    sourceAuthority: sourceAuthorityFromSource(stringValue(value.sourceId), value.sourceAuthority),
    sourceId: stringValue(value.sourceId),
    sourceName: stringValue(value.sourceName, "ARGUS"),
    title: stringValue(value.title, "Evento ARGUS en vigilancia"),
    summary: stringValue(value.description ?? value.summary),
    latitude: numberValue(value.latitude),
    longitude: numberValue(value.longitude),
    region: stringValue(value.locationText ?? value.region),
    occurredAt: isoValue(value.createdAt ?? value.occurredAt),
    receivedAt: isoValue(value.updatedAt ?? value.createdAt),
    severityHint: stringValue(value.severity ?? value.priority),
    raw: event,
  };
}

export function normalizeUnknownToPredictionInput(input: unknown): ArgusPredictionInput {
  const value = asRecord(input);
  const kind = stringValue(value.kind, "system") as ArgusInputKind;
  return {
    id: stringValue(value.id, `input-${Date.now()}`),
    kind,
    sourceAuthority: sourceAuthorityFromSource(stringValue(value.sourceId), value.sourceAuthority),
    sourceId: stringValue(value.sourceId),
    sourceName: stringValue(value.sourceName),
    title: stringValue(value.title, "Input ARGUS en vigilancia"),
    summary: stringValue(value.summary ?? value.description),
    latitude: numberValue(value.latitude),
    longitude: numberValue(value.longitude),
    region: stringValue(value.region ?? value.locationText),
    countryCode: stringValue(value.countryCode ?? value.country),
    occurredAt: isoValue(value.occurredAt ?? value.createdAt),
    receivedAt: isoValue(value.receivedAt ?? value.updatedAt ?? value.createdAt),
    severityHint: stringValue(value.severityHint ?? value.severity ?? value.priority),
    raw: input,
  };
}
