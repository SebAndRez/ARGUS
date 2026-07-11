import type { ArgusIncidentSeverity } from "@/types/knowledgeIntake";
import { detectCriticalImpactSignals } from "@/lib/vigia/threatClassifier";

/**
 * ARGUS v1.0.3.2 — single source of truth for "what severity should this
 * GDACS incident carry". Used by the adapter (fresh ingestion), the
 * read-time mappers (`vigiaIncidentToArgusEvent`, `notificationCenterEngine`
 * — so already-persisted stale rows render correctly without a DB write),
 * and the `repair:gdacs-green` script (historical backfill). Any GDACS
 * severity rule change belongs here, not duplicated across those call
 * sites.
 *
 * Root cause this exists to prevent recurring: GDACS Green flood alerts
 * routinely read "The flood caused 0 deaths and 1000 displaced" — matching
 * the bare word "deaths" without checking the preceding "0" escalated a
 * low-severity Green alert to critical. Official source ≠ critical
 * severity; official only affects confidence/attribution.
 */

export type GdacsAlertColor = "green" | "orange" | "red" | "unknown";

/** Loosely-typed projection accepted from any layer: adapter feature,
 * persisted `KnowledgeIncident`, `ArgusEvent`, or `ArgusNotification`. Every
 * field is optional and independently sourced — callers pass whatever
 * subset they have. */
export type GdacsSeverityInput = {
  sourceId?: string | null;
  sourceName?: string | null;
  tags?: string[] | null;
  title?: string | null;
  description?: string | null;
  /** Current/prior severity — used as the fallback when the alert color
   * can't be determined, and as the baseline for `downgradePersistedGdacsGreenIfNeeded`'s
   * "did this actually change" comparison. */
  severity?: string | null;
  technicalFactors?: Record<string, unknown> | null;
  impact?: { peopleAffected?: number | null } | null;
  casualties?: { deaths?: number | null; displaced?: number | null } | null;
};

export type GdacsSeverityResult = {
  severity: ArgusIncidentSeverity;
  alertColor: GdacsAlertColor;
  isGdacs: boolean;
  changed: boolean;
  reason: string;
};

const SEVERITY_ORDER: Record<ArgusIncidentSeverity, number> = {
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const VALID_SEVERITIES = new Set<ArgusIncidentSeverity>(["unknown", "low", "medium", "high", "critical"]);

function normalizeSeverityLabel(value?: string | null): ArgusIncidentSeverity {
  const normalized = value?.toLowerCase().replace(/^p\d_/, "") ?? "";
  if (normalized === "critical") return "critical";
  if (normalized === "high") return "high";
  if (normalized === "medium") return "medium";
  if (normalized === "low") return "low";
  return VALID_SEVERITIES.has(normalized as ArgusIncidentSeverity) ? (normalized as ArgusIncidentSeverity) : "unknown";
}

/**
 * GDACS is identified by any of: sourceId, sourceName, or a "gdacs" tag —
 * deliberately redundant because the same fact is denormalized differently
 * across the adapter output, the persisted row, and the notification/event
 * projections built from it.
 */
export function isGdacsSource(input: GdacsSeverityInput): boolean {
  const sourceId = input.sourceId?.toLowerCase() ?? "";
  const sourceName = input.sourceName?.toLowerCase() ?? "";
  const tags = (input.tags ?? []).map((tag) => tag.toLowerCase());
  return sourceId === "gdacs" || sourceName.includes("gdacs") || tags.includes("gdacs");
}

/**
 * Alert color detection, most-reliable signal first: the adapter always
 * sets `technicalFactors.gdacsAlertLevel` from the RSS `gdacs:alertlevel`
 * tag directly, so that wins when present. Persisted/notification-layer
 * callers that don't carry `technicalFactors` fall back to the `green` /
 * `orange` / `red` tag, then a "Green ... alert" style title match (GDACS
 * titles are formatted "<Color> <hazard> alert ...").
 */
export function detectGdacsAlertColor(input: GdacsSeverityInput): GdacsAlertColor {
  const fromTechnicalFactors = input.technicalFactors?.gdacsAlertLevel;
  if (typeof fromTechnicalFactors === "string") {
    const normalized = fromTechnicalFactors.toLowerCase();
    if (normalized === "green" || normalized === "orange" || normalized === "red") return normalized;
  }

  const tags = (input.tags ?? []).map((tag) => tag.toLowerCase());
  if (tags.includes("red")) return "red";
  if (tags.includes("orange")) return "orange";
  if (tags.includes("green")) return "green";

  const title = input.title ?? "";
  if (/\bred\b[^.]{0,20}\balert\b/i.test(title)) return "red";
  if (/\borange\b[^.]{0,20}\balert\b/i.test(title)) return "orange";
  if (/\bgreen\b[^.]{0,20}\balert\b/i.test(title)) return "green";

  return "unknown";
}

export function isGdacsGreenIncident(input: GdacsSeverityInput): boolean {
  return isGdacsSource(input) && detectGdacsAlertColor(input) === "green";
}

/**
 * Extracts real (not text-matched-only) deaths/displaced counts from GDACS
 * free text. GDACS floods report `<gdacs:population>` as "0 deaths and 1000
 * displaced" — the number is the only trustworthy signal, never the bare
 * keyword.
 */
export function parseGdacsImpact(text?: string | null): { deaths?: number; displaced?: number } {
  if (!text) return {};
  const deathsMatch = text.match(/(\d[\d,]*)\s*deaths?/i);
  const displacedMatch = text.match(/(\d[\d,]*)\s*displaced/i);
  return {
    deaths: deathsMatch ? Number(deathsMatch[1].replace(/,/g, "")) : undefined,
    displaced: displacedMatch ? Number(displacedMatch[1].replace(/,/g, "")) : undefined,
  };
}

/** Green escalates to medium/high only by real, explicit impact — never by hazard type alone. */
const GREEN_DISPLACED_HIGH = 10_000;
const GREEN_DISPLACED_MEDIUM = 1_000;
const GREEN_POPULATION_HIGH = 50_000;

function canonicalizeGreenSeverity(input: GdacsSeverityInput): { severity: ArgusIncidentSeverity; reason: string } {
  const text = `${input.title ?? ""} ${input.description ?? ""}`;
  const parsedImpact = parseGdacsImpact(text);
  const deaths = input.casualties?.deaths ?? parsedImpact.deaths ?? 0;
  const displaced = input.casualties?.displaced ?? parsedImpact.displaced ?? 0;
  const populationAffected =
    input.impact?.peopleAffected ??
    (typeof input.technicalFactors?.exposedPopulation === "number" ? (input.technicalFactors.exposedPopulation as number) : undefined) ??
    0;

  if (deaths > 0) {
    return { severity: "critical", reason: `gdacs-green-real-deaths:${deaths}` };
  }

  // Explicit, unambiguous damage signals (evacuation/red-alert language/
  // destruction/critical infrastructure) can justify critical even without a
  // parsed death count. The casualties sub-signal is skipped here: real
  // deaths are already handled above via the numeric field, which is more
  // reliable than GDACS's terse English summaries for this check.
  const impactSignals = detectCriticalImpactSignals(text);
  if (impactSignals.evacuation || impactSignals.redAlert || impactSignals.destruction || impactSignals.criticalInfrastructure) {
    return { severity: "critical", reason: `gdacs-green-explicit-damage:${impactSignals.matched.join(",")}` };
  }

  if (displaced >= GREEN_DISPLACED_HIGH || populationAffected >= GREEN_POPULATION_HIGH) {
    return { severity: "high", reason: `gdacs-green-high-impact:displaced=${displaced},population=${populationAffected}` };
  }
  if (displaced >= GREEN_DISPLACED_MEDIUM) {
    return { severity: "medium", reason: `gdacs-green-medium-impact:displaced=${displaced}` };
  }
  return { severity: "low", reason: `gdacs-green-default:deaths=0,displaced=${displaced}` };
}

/**
 * Canonical GDACS severity for any input, from any layer. Deterministic —
 * ignores whatever `input.severity` currently says for Red/Orange/Green
 * (only used as the fallback when the color itself can't be determined).
 * Official source never implies critical severity by itself.
 */
export function canonicalizeGdacsSeverity(input: GdacsSeverityInput): GdacsSeverityResult {
  const priorSeverity = normalizeSeverityLabel(input.severity);
  if (!isGdacsSource(input)) {
    return { severity: priorSeverity, alertColor: "unknown", isGdacs: false, changed: false, reason: "not-gdacs" };
  }

  const alertColor = detectGdacsAlertColor(input);
  let severity: ArgusIncidentSeverity;
  let reason: string;

  if (alertColor === "red") {
    severity = "critical";
    reason = "gdacs-red";
  } else if (alertColor === "orange") {
    severity = "high";
    reason = "gdacs-orange";
  } else if (alertColor === "green") {
    ({ severity, reason } = canonicalizeGreenSeverity(input));
  } else {
    // Alert color couldn't be determined from any signal — never guess;
    // leave the caller's baseline severity untouched.
    severity = priorSeverity;
    reason = "gdacs-color-unknown-no-change";
  }

  return { severity, alertColor, isGdacs: true, changed: severity !== priorSeverity, reason };
}

/**
 * Repair-oriented wrapper: only ever proposes a *downgrade* of a persisted
 * GDACS Green row. Never used to escalate — if the canonical value happens
 * to be higher than what's stored (shouldn't normally happen for Green, but
 * defensively), this reports `shouldUpdate: false` rather than writing a
 * more severe value than what a human/operator may have already reviewed.
 */
export function downgradePersistedGdacsGreenIfNeeded(
  input: GdacsSeverityInput
): { shouldUpdate: boolean; from: ArgusIncidentSeverity; to: ArgusIncidentSeverity; reason: string } | null {
  if (!isGdacsGreenIncident(input)) return null;

  const from = normalizeSeverityLabel(input.severity);
  const { severity: to, reason } = canonicalizeGdacsSeverity(input);

  if (SEVERITY_ORDER[to] >= SEVERITY_ORDER[from]) {
    return { shouldUpdate: false, from, to, reason: "already-correct-or-would-escalate" };
  }
  return { shouldUpdate: true, from, to, reason };
}
