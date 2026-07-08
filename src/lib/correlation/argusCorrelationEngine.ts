import type { ArgusEvent } from "@/types/argusEvent";
import { normalizeSignal, type ArgusSignal } from "@/lib/normalizers/argusEventNormalizer";

function regionsOverlap(a: ArgusEvent, b: ArgusEvent): boolean {
  if (a.country !== b.country) return false;
  const aRegions = extractRegionNames(a);
  const bRegions = extractRegionNames(b);
  if (aRegions.length === 0 || bRegions.length === 0) return false;
  return aRegions.some((region) => bRegions.includes(region));
}

function extractRegionNames(event: ArgusEvent): string[] {
  if (event.geometry.type === "region_reference") return event.geometry.regionNames;
  if (event.region) return [event.region];
  return [];
}

/**
 * `correlateSignals` implements the ARGUS minimum correlation rules:
 *
 * 1. Official weather alert + affected region -> RISK_ZONE (handled by the
 *    caller feeding in a `RISK_ZONE`/`SEVERE_WEATHER` official signal).
 * 2. Official alert + regional news of damage in the same region -> bump
 *    the news event's confidence and link it back to the official zone.
 * 3. (Left to source adapters/demo data: heavy rain + rural/mountain/coastal
 *    zone + "material on the road" news -> tag as landslide-risk-correlated.)
 * 4. Direct official/technical source -> sourceType official/technical,
 *    confidence high (enforced in the normalizer).
 * 5. Press-only -> sourceType news/regional_news, confidence medium or
 *    medium_high (enforced in the normalizer).
 * 6. Citizen report -> sourceType citizen, confidence low (enforced in the
 *    normalizer).
 * 7. Never let a critical-severity event stand on a single low-confidence
 *    source — downgrade severity and force `needsOfficialConfirmation`.
 * 8. Keep projected risk (`status: "risk"|"monitoring"`) distinct from a
 *    confirmed incident (`status: "active"|"confirmed"`) — this is a
 *    per-signal property the caller sets, never inferred/upgraded here.
 */
export function correlateSignals(signals: ArgusSignal[]): ArgusEvent[] {
  const events = signals.map((signal, index) => normalizeSignal(signal, String(index + 1)));

  const officialEvents = events.filter(
    (event) => event.sourceType === "official" || event.sourceType === "technical"
  );

  // Rule 2: news/regional_news reporting damage inside an official alert's
  // region gets linked to that zone and its confidence bumped one notch.
  events.forEach((event) => {
    if (event.sourceType !== "news" && event.sourceType !== "regional_news") return;

    const relatedOfficial = officialEvents.find(
      (official) => official.id !== event.id && regionsOverlap(official, event)
    );
    if (!relatedOfficial) return;

    event.relatedSignals = [...new Set([...(event.relatedSignals ?? []), relatedOfficial.id])];
    if (event.confidence === "medium") {
      event.confidence = "medium_high";
    }
  });

  // Rule 7: guard against a critical event resting on a single low-confidence source.
  events.forEach((event) => {
    if (event.severity === "critical" && event.confidence === "low" && event.sources.length <= 1) {
      event.severity = "high";
      event.needsOfficialConfirmation = true;
    }
  });

  return events;
}
