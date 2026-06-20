import { getArgusSource } from "@/config/argusSourceRegistry";
import type {
  ArgusIngestionSeverity,
  ArgusNormalizedEvent,
  ReliefWebReportItem,
} from "@/types/ingestion";

const RECOMMENDED_ACTION =
  "Revisar contexto humanitario y reportes oficiales antes de tomar decisiones operativas.";

function stripHtml(value?: string) {
  return (value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function inferSeverity(text: string): ArgusIngestionSeverity {
  const normalized = text.toLowerCase();
  if (
    [
      "famine",
      "mass displacement",
      "cholera outbreak",
      "severe flooding",
      "conflict escalation",
    ].some((term) => normalized.includes(term))
  ) {
    return "critical";
  }
  if (
    ["emergency", "disaster", "outbreak", "flood", "conflict"].some((term) =>
      normalized.includes(term)
    )
  ) {
    return "high";
  }
  return "medium";
}

function toIsoDate(value?: string) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function normalizeReliefWebReport(
  report: ReliefWebReportItem
): ArgusNormalizedEvent | null {
  const title = report.fields?.title?.trim();
  const occurredAt = toIsoDate(
    report.fields?.date?.original ?? report.fields?.date?.created
  );
  if (!title || !occurredAt) return null;

  const source = getArgusSource("reliefweb");
  const country = report.fields.country?.[0]?.name?.trim() || null;
  const organization =
    report.fields.source?.[0]?.shortname?.trim() ||
    report.fields.source?.[0]?.name?.trim() ||
    "ReliefWeb";
  const disaster = report.fields.disaster?.[0]?.name?.trim() || null;
  const body = stripHtml(
    report.fields.body ?? report.fields["body-html"]
  );
  const description =
    body.length > 420 ? `${body.slice(0, 417).trim()}...` : body;
  const severity = inferSeverity(
    [title, description, disaster].filter(Boolean).join(" ")
  );
  const externalId = String(report.id);

  return {
    id: `reliefweb-${externalId}`,
    sourceId: "reliefweb",
    sourceName: source?.name ?? "ReliefWeb",
    externalId,
    title,
    description:
      description ||
      `Reporte humanitario publicado por ${organization}.`,
    category: "humanitarian_context",
    severity,
    confidence: source?.reliabilityScore ?? 92,
    latitude: null,
    longitude: null,
    occurredAt,
    updatedAt: occurredAt,
    url: report.fields.url ?? null,
    locationName: country,
    country,
    recommendedAction: RECOMMENDED_ACTION,
    whyItMatters: `${organization}${country ? ` informa contexto humanitario en ${country}` : " aporta contexto humanitario"}${disaster ? ` relacionado con ${disaster}` : ""}.`,
    isExternal: true,
  };
}
