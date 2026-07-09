import type { ArgusHazardDomain, ArgusIncidentSeverity } from "@/types/knowledgeIntake";

export type SevereWeatherThreatType =
  | "TORNADO"
  | "WATERSPOUT"
  | "SEVERE_WIND"
  | "THUNDERSTORM"
  | "HEAVY_RAIN"
  | "LANDSLIDE_RISK"
  | "FLOOD"
  | "OTHER";

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Order matters — more specific phenomena (tornado/tromba) are checked before generic ones (viento/lluvia). */
const THREAT_PATTERNS: Array<{ threat: SevereWeatherThreatType; pattern: RegExp }> = [
  { threat: "TORNADO", pattern: /\btornado/ },
  { threat: "WATERSPOUT", pattern: /tromba marina|tromba de agua|\btromba\b/ },
  { threat: "THUNDERSTORM", pattern: /tormenta[s]? el[ée]ctrica|tormenta[s]? el[ée]ctrico/ },
  { threat: "SEVERE_WIND", pattern: /viento[s]? (fuerte|extremo|severo)|rachas?( de viento)?|viento[s]? moderado/ },
  { threat: "LANDSLIDE_RISK", pattern: /remoci[oó]n en masa|derrumbe|deslizamiento|aluvi[oó]n/ },
  { threat: "FLOOD", pattern: /inundaci[oó]n|desborde/ },
  { threat: "HEAVY_RAIN", pattern: /precipitaci[oó]n(es)? intensa|lluvia intensa|lluvia[s]? fuerte/ },
];

/** Maps free-text hazard descriptions (SENAPRED `variableRiesgo`/`contenido`, DMC-quoted bulletins) to ARGUS's severe-weather threat taxonomy. Order-sensitive: checks most specific phenomenon first. */
export function classifyThreat(text: string): SevereWeatherThreatType {
  const normalized = normalize(text);
  for (const { threat, pattern } of THREAT_PATTERNS) {
    if (pattern.test(normalized)) return threat;
  }
  return "OTHER";
}

const LEVEL_SEVERITY_PATTERNS: Array<{ severity: ArgusIncidentSeverity; pattern: RegExp }> = [
  { severity: "critical", pattern: /alerta roja|alarma/ },
  // Alerta Naranja defaults to the same tier as Alerta Amarilla ("high"),
  // NOT "critical" — see the doc comment on classifySeverityFromLevel below
  // for why, and what would need to change to escalate it conditionally.
  { severity: "high", pattern: /alerta naranja|alerta amarilla|alerta dmc/ },
  { severity: "medium", pattern: /alerta temprana preventiva|aviso dmc/ },
  { severity: "low", pattern: /alerta verde/ },
];

/**
 * Maps SENAPRED's `tipoAlerta.nombre` (or a DMC bulletin level string) to
 * ARGUS severity. Alerta Roja/Alarma -> critical, Alerta Naranja/Alerta
 * Amarilla/Alerta DMC -> high, Alerta Temprana Preventiva/Aviso DMC ->
 * medium, Alerta Verde -> low.
 *
 * Alerta Naranja is deliberately "high", not "critical": this function only
 * receives the short level label (e.g. "Alerta Naranja"), never the alert
 * body, so it has no way to check for severe-impact signals (evacuación,
 * personas atrapadas, daño estructural, amenaza directa a población,
 * instrucción oficial crítica) that would justify escalating a specific
 * Naranja alert to critical. Product has not signed off on a keyword list
 * for that escalation, so this intentionally does NOT guess one — a Naranja
 * alert with genuinely critical impact should be escalated by extending this
 * function to also accept the alert's `contenido`/`threatText` (both already
 * available to every caller: `alertPromotionEngine.ts`'s
 * `ChileOfficialAlertRaw.contenido` and `senapredEventosAdapter.ts`'s
 * `alerta.contenido`) and checking it against an agreed keyword list, not by
 * blanket-promoting every Naranja to critical.
 *
 * Single source of truth for SENAPRED severity — `senapredEventosAdapter.ts`
 * (the live map data path, `/api/argus/events`) reuses this instead of
 * maintaining its own mapping, so the same alert text can never be
 * classified with two different severities depending on which pipeline
 * processed it first.
 */
export function classifySeverityFromLevel(levelText: string): ArgusIncidentSeverity {
  const normalized = normalize(levelText);
  for (const { severity, pattern } of LEVEL_SEVERITY_PATTERNS) {
    if (pattern.test(normalized)) return severity;
  }
  return "medium";
}

const THREAT_TO_DOMAIN: Record<SevereWeatherThreatType, ArgusHazardDomain> = {
  TORNADO: "tornado",
  WATERSPOUT: "waterspout",
  SEVERE_WIND: "severe_wind",
  THUNDERSTORM: "thunderstorm",
  HEAVY_RAIN: "storm",
  LANDSLIDE_RISK: "landslide",
  FLOOD: "flood",
  OTHER: "weather_alert",
};

/** Maps a classified threat to the existing `ArgusHazardDomain` union used by `KnowledgeIncident` persistence — additive values only (`waterspout`/`severe_wind`/`thunderstorm`), the rest already existed. */
export function mapThreatToHazardDomain(threat: SevereWeatherThreatType): ArgusHazardDomain {
  return THREAT_TO_DOMAIN[threat];
}
