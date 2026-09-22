import type { ArgusEventStatus, ArgusEventType, ArgusSeverity } from "@/types/argusEvent";
import type { CrisisEvent, EventSeverity } from "@/types/crisis";
import type { ModuleIncidentSummary } from "@/types/moduleOperationalContext";

/**
 * Single adapter from the canonical incident projection (`ModuleIncidentSummary`,
 * served by `/api/modules/incidents` through `CanonicalIncidentGateway`) to the
 * `CrisisEvent` shape the module engines (TALOS scoring, HERMES blockages and
 * risk zones, ATLAS/ORÁCULO feeds) already consume. Modules must not map
 * canonical incidents themselves — this keeps severity/lifecycle/category
 * decided once.
 */

/** Canonical 5-level severity → legacy 4-level scale. `info` is never promoted. */
const SEVERITY: Record<ArgusSeverity, EventSeverity> = {
  info: "LOW",
  low: "LOW",
  medium: "MEDIUM",
  high: "HIGH",
  critical: "CRITICAL",
};

/**
 * Canonical type → the Spanish category vocabulary the module engines already
 * recognise (`mapCrisisCategoryToTalosCategory`, HERMES blockage detection).
 */
const CATEGORY: Record<ArgusEventType, string> = {
  OFFICIAL_ALERT: "alerta oficial",
  SEVERE_WEATHER: "clima severo",
  HEAVY_RAIN: "inundacion por lluvia intensa",
  FLOOD: "inundacion",
  LANDSLIDE: "derrumbe",
  ROAD_CLOSURE: "corte de ruta",
  EARTHQUAKE: "sismo",
  TSUNAMI: "tsunami",
  VOLCANIC_ACTIVITY: "volcan",
  WILDFIRE: "incendio",
  POWER_OUTAGE: "infraestructura - corte electrico",
  CIVIL_UNREST: "seguridad publica",
  CONFLICT: "conflicto",
  HEALTH_EMERGENCY: "emergencia medica",
  INFRASTRUCTURE_FAILURE: "infraestructura",
  NEWS_REPORTED_INCIDENT: "incidente reportado en medios",
  CITIZEN_REPORT: "reporte ciudadano",
  RISK_ZONE: "zona de riesgo",
  COASTAL_HAZARD: "clima costero",
  TORNADO: "clima severo - tornado",
  WATERSPOUT: "clima severo - tromba marina",
  SEVERE_WIND: "clima severo - viento",
  STRUCTURAL_COLLAPSE: "infraestructura - colapso estructural",
  ROOF_COLLAPSE: "infraestructura - colapso de techumbre",
  BUILDING_COLLAPSE: "infraestructura - colapso de edificio",
};

const CLOSED_LIFECYCLES: ReadonlySet<ArgusEventStatus> = new Set(["resolved", "archived"]);

/** Id prefix that marks a `CrisisEvent` as coming from the canonical pipeline. */
export const CANONICAL_EVENT_ID_PREFIX = "canonical:";

export function isCanonicalCrisisEvent(event: Pick<CrisisEvent, "id">): boolean {
  return event.id.startsWith(CANONICAL_EVENT_ID_PREFIX);
}

/**
 * Returns `null` for incidents without a point location (the engines are
 * point-based) — never invents coordinates.
 */
export function canonicalIncidentToCrisisEvent(summary: ModuleIncidentSummary): CrisisEvent | null {
  const { latitude, longitude } = summary.location;
  if (latitude === null || longitude === null || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  return {
    id: `${CANONICAL_EVENT_ID_PREFIX}${summary.id}`,
    title: summary.title,
    category: CATEGORY[summary.type] ?? "alerta",
    description: summary.summary ?? summary.title,
    latitude,
    longitude,
    locationText: summary.location.regionCode ?? summary.location.countryCode ?? null,
    severity: SEVERITY[summary.severity] ?? "MEDIUM",
    type: "ALERT",
    // Module status vocabulary (see toVigiaStatus): official/corroborated → VALIDATED.
    status: CLOSED_LIFECYCLES.has(summary.lifecycle)
      ? "RESOLVED"
      : summary.verificationStatus === "official" || summary.verificationStatus === "corroborated"
        ? "VALIDATED"
        : "NEW",
    createdAt: summary.timing.startedAt ?? summary.timing.updatedAt,
    updatedAt: summary.timing.updatedAt,
    expiresAt: summary.timing.expiresAt,
    sourceId: summary.sourceSummary.primarySource,
    sourceCategory: summary.sourceSummary.isOfficial ? "official" : "open_data",
    lifecycleStatus: null,
  };
}

export function canonicalIncidentsToCrisisEvents(summaries: ModuleIncidentSummary[]): CrisisEvent[] {
  return summaries
    .map(canonicalIncidentToCrisisEvent)
    .filter((event): event is CrisisEvent => event !== null);
}
