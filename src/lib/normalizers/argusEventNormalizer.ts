import type {
  ArgusEvent,
  ArgusEventStatus,
  ArgusEventType,
  ArgusGeometry,
  ArgusGeometryPrecision,
  ArgusSeverity,
  ArgusSourceReference,
} from "@/types/argusEvent";
import type { ArgusSourceRegistryEntry } from "@/types/sourceRegistry";

/**
 * Raw signal contracts consumed by the normalizer. These are intentionally
 * shaped like "what a source adapter would hand back" so a future real
 * `chileAdapter.ts` can build the exact same shape from a live SENAPRED/DMC
 * feed instead of curated demo data.
 */
interface ArgusSignalBase {
  country: string;
  region?: string;
  province?: string;
  commune?: string;
  eventType: ArgusEventType;
  severity: ArgusSeverity;
  status: ArgusEventStatus;
  title: string;
  operationalSummary: string;
  geometry: ArgusGeometry;
  geometryPrecision: ArgusGeometryPrecision;
  publishedAt: string;
  validFrom?: string;
  validUntil?: string;
  recommendedActions?: string[];
  tags?: string[];
  isDemo?: boolean;
}

/**
 * Caso A: ARGUS reads the authority's own feed directly. `sources[0]` must
 * be `sourceType: "official" | "technical"`.
 */
export interface OfficialAlertSignal extends ArgusSignalBase {
  kind: "official_alert";
  sources: ArgusSourceRegistryEntry[];
}

/**
 * Caso B: ARGUS reads a news report. `sources[0]` must be
 * `sourceType: "news" | "regional_news"`. If the article names an official
 * authority, list it in `officialAuthorityMentioned` — attribution still
 * stays with the outlet and `needsOfficialConfirmation` is forced true.
 */
export interface NewsMentionSignal extends ArgusSignalBase {
  kind: "news_mention";
  sources: ArgusSourceRegistryEntry[];
  officialAuthorityMentioned?: string[];
}

export interface CitizenReportSignal extends ArgusSignalBase {
  kind: "citizen_report";
  reporterLabel: string;
}

export type ArgusSignal = OfficialAlertSignal | NewsMentionSignal | CitizenReportSignal;

function toSourceReference(
  source: ArgusSourceRegistryEntry,
  extra?: { url?: string; publishedAt?: string; officialAuthorityMentioned?: string[] }
): ArgusSourceReference {
  return {
    sourceId: source.id,
    sourceName: source.name,
    sourceType: source.sourceType,
    url: extra?.url ?? source.url,
    publishedAt: extra?.publishedAt,
    officialAuthorityMentioned: extra?.officialAuthorityMentioned,
  };
}

function makeId(prefix: string, seed: string) {
  return `${prefix}-${seed}`;
}

export function normalizeOfficialAlert(signal: OfficialAlertSignal, idSeed: string): ArgusEvent {
  const primary = signal.sources[0];
  if (!primary || (primary.sourceType !== "official" && primary.sourceType !== "technical")) {
    throw new Error(
      `normalizeOfficialAlert requires sources[0].sourceType to be "official" or "technical" (got ${primary?.sourceType})`
    );
  }

  return {
    id: makeId("argus-event", idSeed),
    title: signal.title,
    country: signal.country,
    region: signal.region,
    province: signal.province,
    commune: signal.commune,
    eventType: signal.eventType,
    severity: signal.severity,
    status: signal.status,
    confidence: "high",
    sourceType: primary.sourceType,
    sources: signal.sources.map((source) => toSourceReference(source, { publishedAt: signal.publishedAt })),
    geometry: signal.geometry,
    geometryPrecision: signal.geometryPrecision,
    validFrom: signal.validFrom,
    validUntil: signal.validUntil,
    detectedAt: signal.publishedAt,
    lastUpdated: signal.publishedAt,
    attribution: primary.name,
    needsOfficialConfirmation: false,
    operationalSummary: signal.operationalSummary,
    recommendedActions: signal.recommendedActions,
    tags: signal.tags,
    isDemo: signal.isDemo,
  };
}

export function normalizeNewsMention(signal: NewsMentionSignal, idSeed: string): ArgusEvent {
  const primary = signal.sources[0];
  if (!primary || (primary.sourceType !== "news" && primary.sourceType !== "regional_news")) {
    throw new Error(
      `normalizeNewsMention requires sources[0].sourceType to be "news" or "regional_news" (got ${primary?.sourceType})`
    );
  }

  const mentionsAuthority = Boolean(signal.officialAuthorityMentioned?.length);

  return {
    id: makeId("argus-event", idSeed),
    title: signal.title,
    country: signal.country,
    region: signal.region,
    province: signal.province,
    commune: signal.commune,
    eventType: signal.eventType,
    severity: signal.severity,
    status: signal.status,
    confidence: mentionsAuthority ? "medium_high" : "medium",
    sourceType: primary.sourceType,
    sources: signal.sources.map((source) =>
      toSourceReference(source, {
        publishedAt: signal.publishedAt,
        officialAuthorityMentioned: signal.officialAuthorityMentioned,
      })
    ),
    geometry: signal.geometry,
    geometryPrecision: signal.geometryPrecision,
    validFrom: signal.validFrom,
    validUntil: signal.validUntil,
    detectedAt: signal.publishedAt,
    lastUpdated: signal.publishedAt,
    attribution: primary.name,
    officialAuthorityMentioned: signal.officialAuthorityMentioned,
    needsOfficialConfirmation: true,
    operationalSummary: signal.operationalSummary,
    recommendedActions: signal.recommendedActions,
    tags: signal.tags,
    isDemo: signal.isDemo,
  };
}

export function normalizeCitizenReport(signal: CitizenReportSignal, idSeed: string): ArgusEvent {
  return {
    id: makeId("argus-event", idSeed),
    title: signal.title,
    country: signal.country,
    region: signal.region,
    province: signal.province,
    commune: signal.commune,
    eventType: signal.eventType,
    severity: signal.severity,
    status: signal.status,
    confidence: "low",
    sourceType: "citizen",
    sources: [
      {
        sourceId: `citizen-${idSeed}`,
        sourceName: signal.reporterLabel,
        sourceType: "citizen",
        publishedAt: signal.publishedAt,
      },
    ],
    geometry: signal.geometry,
    geometryPrecision: signal.geometryPrecision,
    validFrom: signal.validFrom,
    validUntil: signal.validUntil,
    detectedAt: signal.publishedAt,
    lastUpdated: signal.publishedAt,
    attribution: signal.reporterLabel,
    needsOfficialConfirmation: true,
    operationalSummary: signal.operationalSummary,
    recommendedActions: signal.recommendedActions,
    tags: signal.tags,
    isDemo: signal.isDemo,
  };
}

export function normalizeSignal(signal: ArgusSignal, idSeed: string): ArgusEvent {
  switch (signal.kind) {
    case "official_alert":
      return normalizeOfficialAlert(signal, idSeed);
    case "news_mention":
      return normalizeNewsMention(signal, idSeed);
    case "citizen_report":
      return normalizeCitizenReport(signal, idSeed);
  }
}
