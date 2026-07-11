import type { ArgusEventType } from "@/types/argusEvent";
import type { ArgusHazardDomain, ArgusIncidentSeverity } from "@/types/knowledgeIntake";

/**
 * ARGUS Global Watch threat taxonomy. Every external event ingested by the
 * VIGÍA engine — regardless of source (USGS, GDACS, EONET, FIRMS, EFFIS,
 * ReliefWeb, SENAPRED, news) — is classified into exactly one of these
 * types before promotion, so dedup keys, map layers and notifications all
 * speak the same threat language.
 */
export type GlobalThreatType =
  | "EARTHQUAKE"
  | "TSUNAMI"
  | "WILDFIRE"
  | "FLOOD"
  | "SEVERE_WEATHER"
  | "TORNADO"
  | "WATERSPOUT"
  | "SEVERE_WIND"
  | "LANDSLIDE"
  | "VOLCANO"
  | "CYCLONE"
  | "HUMANITARIAN_CRISIS"
  | "INFRASTRUCTURE_DAMAGE"
  | "RESCUE_OPERATION"
  | "CIVIL_UNREST"
  | "UNKNOWN";

export const GLOBAL_THREAT_TYPES: GlobalThreatType[] = [
  "EARTHQUAKE",
  "TSUNAMI",
  "WILDFIRE",
  "FLOOD",
  "SEVERE_WEATHER",
  "TORNADO",
  "WATERSPOUT",
  "SEVERE_WIND",
  "LANDSLIDE",
  "VOLCANO",
  "CYCLONE",
  "HUMANITARIAN_CRISIS",
  "INFRASTRUCTURE_DAMAGE",
  "RESCUE_OPERATION",
  "CIVIL_UNREST",
  "UNKNOWN",
];

export type ThreatClassifierInput = {
  domain?: string | null;
  subtype?: string | null;
  title?: string | null;
  summary?: string | null;
  tags?: string[] | null;
};

/**
 * Domain values already produced by the knowledge-intake adapters map
 * directly; free text is only consulted when the domain is ambiguous
 * (e.g. ReliefWeb "humanitarian", GDACS "natural_disaster", news items).
 */
const DOMAIN_TO_THREAT: Record<string, GlobalThreatType> = {
  earthquake: "EARTHQUAKE",
  tsunami: "TSUNAMI",
  wildfire: "WILDFIRE",
  fire: "WILDFIRE",
  forest_fire: "WILDFIRE",
  flood: "FLOOD",
  flood_context: "FLOOD",
  storm: "SEVERE_WEATHER",
  thunderstorm: "SEVERE_WEATHER",
  weather_alert: "SEVERE_WEATHER",
  hurricane: "CYCLONE",
  cyclone: "CYCLONE",
  tornado: "TORNADO",
  waterspout: "WATERSPOUT",
  severe_wind: "SEVERE_WIND",
  landslide: "LANDSLIDE",
  avalanche: "LANDSLIDE",
  volcano: "VOLCANO",
  humanitarian: "HUMANITARIAN_CRISIS",
  humanitarian_crisis: "HUMANITARIAN_CRISIS",
  drought: "HUMANITARIAN_CRISIS",
  structural_collapse: "INFRASTRUCTURE_DAMAGE",
  bridge_collapse: "INFRASTRUCTURE_DAMAGE",
  building_collapse: "INFRASTRUCTURE_DAMAGE",
  infrastructure: "INFRASTRUCTURE_DAMAGE",
  rescue: "RESCUE_OPERATION",
  civil_unrest: "CIVIL_UNREST",
  conflict: "CIVIL_UNREST",
};

/** Keyword table (Spanish + English) used when the domain alone is not enough. */
const TEXT_RULES: Array<{ threat: GlobalThreatType; pattern: RegExp }> = [
  { threat: "TSUNAMI", pattern: /tsunami|maremoto/i },
  { threat: "EARTHQUAKE", pattern: /earthquake|terremoto|sismo|seismic|magnitude\s*[0-9]/i },
  { threat: "TORNADO", pattern: /tornado/i },
  { threat: "WATERSPOUT", pattern: /waterspout|tromba\s+marina/i },
  { threat: "CYCLONE", pattern: /hurricane|cyclone|typhoon|hurac[aá]n|cicl[oó]n|tif[oó]n/i },
  { threat: "WILDFIRE", pattern: /wildfire|forest\s*fire|incendio\s+(forestal|de\s+vegetaci)|burned\s+area|bushfire|active\s+fire/i },
  { threat: "FLOOD", pattern: /flood|inundaci[oó]n|desborde|crecida|flash\s*flood|anegamiento/i },
  { threat: "LANDSLIDE", pattern: /landslide|mudslide|deslizamiento|remoci[oó]n\s+en\s+masa|alud|avalancha|derrumbe\s+de\s+ladera/i },
  { threat: "VOLCANO", pattern: /volcan|volcano|eruption|erupci[oó]n|ash\s*(cloud|fall)|piroclast/i },
  { threat: "SEVERE_WIND", pattern: /viento[s]?\s+(fuerte|intenso|severo)|strong\s+wind|wind\s*storm|vendaval|r[aá]fagas/i },
  { threat: "SEVERE_WEATHER", pattern: /storm|tormenta|granizo|hail|blizzard|nevada|heavy\s+rain|lluvia[s]?\s+intensa|frente\s+de\s+mal\s+tiempo|severe\s+weather/i },
  { threat: "RESCUE_OPERATION", pattern: /rescue|rescate|search\s+and\s+rescue|b[uú]squeda\s+y\s+rescate|atrapad[oa]s?|trapped/i },
  { threat: "INFRASTRUCTURE_DAMAGE", pattern: /collapse|colapso|derrumbe|infraestructura\s+(cr[ií]tica\s+)?(da[ñn]ada|afectada)|power\s+outage|corte\s+de\s+(luz|energ[ií]a|agua)|bridge\s+damage/i },
  { threat: "CIVIL_UNREST", pattern: /riot|protest|disturbio|unrest|saqueo|looting|enfrentamiento/i },
  { threat: "HUMANITARIAN_CRISIS", pattern: /humanitarian|humanitaria|refugee|desplazad|displaced|famine|hambruna|epidemic|epidemia|cholera|drought|sequ[ií]a/i },
];

export function classifyGlobalThreat(input: ThreatClassifierInput): GlobalThreatType {
  const domain = input.domain?.toLowerCase().trim() ?? "";
  const subtype = input.subtype?.toLowerCase().trim() ?? "";

  if (DOMAIN_TO_THREAT[subtype]) return DOMAIN_TO_THREAT[subtype];
  if (DOMAIN_TO_THREAT[domain]) return DOMAIN_TO_THREAT[domain];

  const text = [input.title ?? "", input.summary ?? "", subtype, domain, ...(input.tags ?? [])]
    .join(" ")
    .slice(0, 2000);
  for (const rule of TEXT_RULES) {
    if (rule.pattern.test(text)) return rule.threat;
  }
  return "UNKNOWN";
}

/** Maps a global threat back to the hazard-domain vocabulary `KnowledgeIncident.domain` uses. */
export function threatToHazardDomain(threat: GlobalThreatType): ArgusHazardDomain {
  const mapping: Record<GlobalThreatType, ArgusHazardDomain> = {
    EARTHQUAKE: "earthquake",
    TSUNAMI: "tsunami",
    WILDFIRE: "wildfire",
    FLOOD: "flood",
    SEVERE_WEATHER: "storm",
    TORNADO: "tornado",
    WATERSPOUT: "waterspout",
    SEVERE_WIND: "severe_wind",
    LANDSLIDE: "landslide",
    VOLCANO: "volcano",
    CYCLONE: "hurricane",
    HUMANITARIAN_CRISIS: "humanitarian_crisis",
    INFRASTRUCTURE_DAMAGE: "natural_disaster",
    RESCUE_OPERATION: "natural_disaster",
    CIVIL_UNREST: "natural_disaster",
    UNKNOWN: "natural_disaster",
  };
  return mapping[threat];
}

/** Maps a global threat to the `ArgusEventType` used by the operational map layer. */
export function threatToArgusEventType(threat: GlobalThreatType): ArgusEventType {
  const mapping: Record<GlobalThreatType, ArgusEventType> = {
    EARTHQUAKE: "EARTHQUAKE",
    TSUNAMI: "TSUNAMI",
    WILDFIRE: "WILDFIRE",
    FLOOD: "FLOOD",
    SEVERE_WEATHER: "SEVERE_WEATHER",
    TORNADO: "TORNADO",
    WATERSPOUT: "WATERSPOUT",
    SEVERE_WIND: "SEVERE_WIND",
    LANDSLIDE: "LANDSLIDE",
    VOLCANO: "VOLCANIC_ACTIVITY",
    CYCLONE: "SEVERE_WEATHER",
    HUMANITARIAN_CRISIS: "HEALTH_EMERGENCY",
    INFRASTRUCTURE_DAMAGE: "INFRASTRUCTURE_FAILURE",
    RESCUE_OPERATION: "OFFICIAL_ALERT",
    CIVIL_UNREST: "CIVIL_UNREST",
    UNKNOWN: "NEWS_REPORTED_INCIDENT",
  };
  return mapping[threat];
}

export type CriticalImpactSignals = {
  casualties: boolean;
  evacuation: boolean;
  redAlert: boolean;
  destruction: boolean;
  criticalInfrastructure: boolean;
  /** true when at least one signal implies the incident must be `critical`. */
  shouldEscalateToCritical: boolean;
  matched: string[];
};

const IMPACT_PATTERNS: Array<{ key: keyof Omit<CriticalImpactSignals, "shouldEscalateToCritical" | "matched">; label: string; pattern: RegExp }> = [
  { key: "casualties", label: "víctimas", pattern: /fatalit|death[s]?|dead|killed|muert[oa]s?|fallecid|v[ií]ctima|casualt|herid[oa]s?\s+grave/gi },
  { key: "evacuation", label: "evacuación", pattern: /evacuat|evacuaci[oó]n|evacuad[oa]s|desalojo/i },
  { key: "redAlert", label: "alerta roja", pattern: /alerta\s+roja|red\s+alert|nivel\s+rojo/i },
  { key: "destruction", label: "destrucción", pattern: /destroy|destrucci[oó]n|devastat|arrasad|viviendas?\s+(destruida|quemada)|homes?\s+(destroyed|burned)/i },
  { key: "criticalInfrastructure", label: "infraestructura crítica", pattern: /hospital|airport|aeropuerto|power\s+(plant|grid)|red\s+el[eé]ctrica|planta\s+de\s+agua|puente|bridge\s+(collapse|damage)|infraestructura\s+cr[ií]tica/i },
];

/**
 * A casualty keyword preceded by an explicit zero ("0 deaths", "no dead",
 * "sin víctimas") is a non-event, not an impact signal. GDACS/ReliefWeb-style
 * feeds routinely report "0 deaths and N displaced" even for Green-level
 * alerts — matching the bare keyword there falsely escalated severity.
 */
const ZERO_CASUALTY_QUALIFIER = /(?:\b0\b|\bno\b|\bzero\b|\bsin\b|\bning[uú]n[ao]?\b)\s*$/i;

function hasNonZeroCasualtyMention(text: string): boolean {
  const pattern = IMPACT_PATTERNS.find((rule) => rule.key === "casualties")!.pattern;
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const precedingText = text.slice(Math.max(0, match.index - 15), match.index);
    if (!ZERO_CASUALTY_QUALIFIER.test(precedingText)) return true;
  }
  return false;
}

/**
 * Detects human-impact signals in free text. Per Global Watch promotion
 * rules, any of: víctimas, evacuación, alerta roja, destrucción or
 * infraestructura crítica ⇒ the incident severity must be raised to
 * `critical`.
 */
export function detectCriticalImpactSignals(text: string): CriticalImpactSignals {
  const signals: CriticalImpactSignals = {
    casualties: false,
    evacuation: false,
    redAlert: false,
    destruction: false,
    criticalInfrastructure: false,
    shouldEscalateToCritical: false,
    matched: [],
  };
  for (const rule of IMPACT_PATTERNS) {
    const matched = rule.key === "casualties" ? hasNonZeroCasualtyMention(text) : rule.pattern.test(text);
    if (matched) {
      signals[rule.key] = true;
      signals.matched.push(rule.label);
    }
  }
  signals.shouldEscalateToCritical = signals.matched.length > 0;
  return signals;
}

const SEVERITY_ORDER: Record<ArgusIncidentSeverity, number> = {
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function maxSeverity(a: ArgusIncidentSeverity, b: ArgusIncidentSeverity): ArgusIncidentSeverity {
  return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b;
}

export function severityAtLeast(severity: ArgusIncidentSeverity, floor: ArgusIncidentSeverity): boolean {
  return SEVERITY_ORDER[severity] >= SEVERITY_ORDER[floor];
}
