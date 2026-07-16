import { severityOrder } from "@/lib/notifications/notificationVisuals";
import type {
  ArgusNotificationSeverity,
  ArgusNotificationSourceType,
} from "@/types/notificationCenter";

/**
 * ARGUS v1.0.3.3 — central detector for placeholder/demo/mock/sample/seed/
 * fallback content, so it can never present itself as a real, live,
 * critical source in production. Root cause this exists to prevent: the
 * static `curatedConflictEvents` entry `event-gaza-humanitarian-alert`
 * (`src/data/conflictZones.ts`) carries `sourceName: "ReliefWeb placeholder"`
 * and `severity: "critical"` — with no guard, `notificationCenterEngine`
 * turned that into a P0_CRITICAL, pinned, `category=official` notification
 * titled "Humanitarian alert signal in Gaza" in production.
 *
 * Two-tier text matching, mirroring `canonicalizeGdacsSeverity`'s
 * "official source ≠ critical severity" precedent for GDACS: strong words
 * (placeholder/demo/mock/synthetic/simulated/fallback) are checked anywhere,
 * including free-text titles/descriptions, because real ARGUS sources never
 * legitimately use them. Weak words (test/seed/sample) are common English
 * words that can appear in real crisis text ("water sample", "seed bank",
 * "field test") — those are only checked in structural/identifier fields
 * (sourceName, sourceId, tags, relatedIncidentId, ...), never in free text,
 * per explicit instruction: never block a real source just because its text
 * contains an ordinary word like "test" in an unrelated context.
 */

export interface DemoLikeSignalInput {
  title?: string | null;
  description?: string | null;
  summary?: string | null;
  sourceName?: string | null;
  sourceId?: string | null;
  rawProvider?: string | null;
  tags?: string[] | null;
  relatedIncidentId?: string | null;
  relatedEventId?: string | null;
  sourceUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  technicalFactors?: Record<string, unknown> | null;
  isDemo?: boolean | null;
  isSeed?: boolean | null;
  environment?: string | null;
}

const STRONG_TEXT_SIGNAL_PATTERN =
  /\b(placeholder|demo|mock(?:ed|up)?|synthetic|simulated|fallback)\b/i;

const STRUCTURAL_ONLY_SIGNAL_PATTERN = /\b(test|seed(?:ed)?|sample)\b/i;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Generic "does this text look like placeholder/demo content" check. Only
 * the strong-word pattern — safe to call on arbitrary free text (titles,
 * descriptions) without the weak-word false-positive risk described above.
 */
export function isPlaceholderLikeText(value: string | null | undefined): boolean {
  if (!value) return false;
  return STRONG_TEXT_SIGNAL_PATTERN.test(value);
}

function collectStructuralSignals(input: DemoLikeSignalInput): string[] {
  const direct = [
    input.sourceName,
    input.sourceId,
    input.rawProvider,
    input.relatedIncidentId,
    input.relatedEventId,
    input.sourceUrl,
  ];
  const fromTags = Array.isArray(input.tags) ? input.tags : [];
  const fromObjects = [input.metadata, input.technicalFactors]
    .filter((value): value is Record<string, unknown> => Boolean(value && typeof value === "object"))
    .flatMap((record) => Object.values(record))
    .filter(isNonEmptyString);

  return [...direct, ...fromTags, ...fromObjects].filter(isNonEmptyString);
}

/**
 * Explicit flags (`isDemo`, `isSeed`, a non-production `environment` tag)
 * always win. Otherwise: strong signals anywhere (free text or structural
 * fields), weak signals only in structural/identifier fields.
 */
export function isDemoLikeSource(input: DemoLikeSignalInput): boolean {
  if (input.isDemo === true || input.isSeed === true) return true;
  if (
    typeof input.environment === "string" &&
    /^(demo|test|staging|dev|development)$/i.test(input.environment.trim())
  ) {
    return true;
  }

  const freeText = [input.title, input.description, input.summary].filter(isNonEmptyString);
  if (freeText.some((value) => STRONG_TEXT_SIGNAL_PATTERN.test(value))) return true;

  const structural = collectStructuralSignals(input);
  return structural.some(
    (value) => STRONG_TEXT_SIGNAL_PATTERN.test(value) || STRUCTURAL_ONLY_SIGNAL_PATTERN.test(value)
  );
}

/**
 * Deliberately independent of `isDemoDataAllowed()` (`productionGuard.ts`),
 * which permits seed/demo *events* (Chile alerts `?seed=true`, Global Watch
 * `?seed=true`) everywhere outside production. Placeholder/demo *content*
 * masquerading as a real critical/official source is a different, stricter
 * concern: it must be capped/hidden in every environment — dev included, so
 * a local `npm run dev` smoke test actually exercises the fix — unless an
 * operator explicitly opts in with `ARGUS_ALLOW_DEMO_DATA=true`.
 */
function isDemoDataExplicitlyAllowed(): boolean {
  return process.env.ARGUS_ALLOW_DEMO_DATA === "true";
}

export function shouldHideDemoDataInProduction(input: DemoLikeSignalInput): boolean {
  return isDemoLikeSource(input) && !isDemoDataExplicitlyAllowed();
}

const DEMO_MAX_NOTIFICATION_SEVERITY: ArgusNotificationSeverity = "P3_LOW";

/**
 * `sourceType`s that a builder could otherwise resolve toward
 * `category: "official_alert"`/`"confirmed_incident"` (see
 * `classifyNotification` call sites in
 * `src/lib/notifications/notificationCenterEngine.ts` — CITIZEN already maps
 * to `citizen_report`, ARGUS_ESTIMATE/SYSTEM already map to
 * `candidate_signal`/`system_notice`). Demo-like input is only ever remapped
 * away from these, never relabeled when it's already outside that bucket, so
 * a demo citizen report stays attributed as a citizen report. `finalize()`
 * separately forces `category: "demo"` for any demo-like item regardless of
 * this `sourceType` degrade, which is the guarantee callers actually rely on.
 */
const OFFICIAL_MAPPED_SOURCE_TYPES: ReadonlySet<ArgusNotificationSourceType> = new Set([
  "OFFICIAL",
  "OPEN_DATA",
  "INSTITUTIONAL",
]);
const DEMO_NOTIFICATION_SOURCE_TYPE: ArgusNotificationSourceType = "ARGUS_ESTIMATE";

export interface NotificationLikeInput extends DemoLikeSignalInput {
  severity: ArgusNotificationSeverity;
  sourceType: ArgusNotificationSourceType;
}

export interface CanonicalizedNotificationPatch {
  isDemoLike: boolean;
  severity: ArgusNotificationSeverity;
  sourceType: ArgusNotificationSourceType;
}

/**
 * Degrades a not-yet-`finalize()`d notification field set so demo/
 * placeholder content can never render as P0_CRITICAL, pinned (pinning in
 * `finalize()` is derived purely from `severity === "P0_CRITICAL"`, so
 * capping severity here also fixes pinning without duplicating that check),
 * or `category=official`. Never escalates — a demo item already below
 * P3_LOW (i.e. P4_INFO) is left untouched.
 */
export function canonicalizeDemoLikeNotification(
  input: NotificationLikeInput
): CanonicalizedNotificationPatch {
  if (!shouldHideDemoDataInProduction(input)) {
    return { isDemoLike: isDemoLikeSource(input), severity: input.severity, sourceType: input.sourceType };
  }

  const severity =
    severityOrder[input.severity] < severityOrder[DEMO_MAX_NOTIFICATION_SEVERITY]
      ? DEMO_MAX_NOTIFICATION_SEVERITY
      : input.severity;
  const sourceType = OFFICIAL_MAPPED_SOURCE_TYPES.has(input.sourceType)
    ? DEMO_NOTIFICATION_SOURCE_TYPE
    : input.sourceType;

  return { isDemoLike: true, severity, sourceType };
}

type RiskLevel = "low" | "medium" | "high" | "critical";

const RISK_LEVEL_ORDER: Record<RiskLevel, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export interface EventLikeInput extends DemoLikeSignalInput {
  severity?: RiskLevel | null;
  riskLevel?: RiskLevel | null;
}

export interface CanonicalizedEventPatch {
  isDemoLike: boolean;
  severity?: RiskLevel;
  riskLevel?: RiskLevel;
}

function capRiskLevel(level: RiskLevel): RiskLevel {
  return RISK_LEVEL_ORDER[level] < RISK_LEVEL_ORDER.low ? "low" : level;
}

/**
 * Same idea as `canonicalizeDemoLikeNotification`, for raw `ConflictEvent`
 * (`severity`) / `ConflictZone` (`riskLevel`) shaped records served by
 * `/api/conflict-events` and `/api/conflict-zones` — so a demo record is
 * never exposed as `critical` even in the raw `curated_static` feed.
 */
export function canonicalizeDemoLikeEvent(input: EventLikeInput): CanonicalizedEventPatch {
  const isDemoLike = isDemoLikeSource(input);
  if (!shouldHideDemoDataInProduction(input)) {
    return {
      isDemoLike,
      ...(input.severity ? { severity: input.severity } : {}),
      ...(input.riskLevel ? { riskLevel: input.riskLevel } : {}),
    };
  }

  return {
    isDemoLike: true,
    ...(input.severity ? { severity: capRiskLevel(input.severity) } : {}),
    ...(input.riskLevel ? { riskLevel: capRiskLevel(input.riskLevel) } : {}),
  };
}
