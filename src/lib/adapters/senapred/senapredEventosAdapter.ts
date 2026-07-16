import { chileSources } from "@/data/countrySourcePacks/chile";
import type { ArgusEventType, ArgusEventStatus } from "@/types/argusEvent";
import type { OfficialAlertSignal } from "@/lib/normalizers/argusEventNormalizer";
import { fetchChileOfficialAlertsRaw, type ChileOfficialAlertRaw } from "@/lib/sources/chile/senapredProvider";
import { classifySeverityFromLevel } from "@/lib/weather/severeWeatherClassifier";
import { resolveAdministrativeAreaWithFallback } from "@/lib/geometry/argusGeometryResolver";

/**
 * ARGUS Prompt 14 — consolidación de ingestión SENAPRED.
 *
 * Este módulo ya NO ejecuta su propia paginación contra AppSync. Antes tenía
 * un `do/while` independiente sobre `fetchAlertasByDatePage` (idéntico en
 * espíritu al de `senapredProvider.ts::fetchChileOfficialAlertsRaw`, pero una
 * segunda implementación real) y construía geometría de solo punto-ancla
 * (`region_reference`) en vez de los polígonos administrativos reales que
 * `alertPromotionEngine.ts` ya resuelve. Ambos defectos quedan corregidos
 * delegando aquí en el fetch canónico único:
 *
 * ```
 * fetchSenapredAlerts() → fetchChileOfficialAlertsRaw() (única consulta AppSync)
 *                        → resolveAdministrativeAreaWithFallback() (misma geometría real
 *                          que usa la persistencia canónica, nunca un ancla de punto)
 * ```
 *
 * Sigue existiendo (no se eliminó, Prompt 14 §21 — no hay forma de confirmar
 * cero consumidores sin antes migrar `/api/argus/senapred/live`, que sigue
 * llamándolo) como una proyección de lectura *sin persistencia* para ese
 * endpoint de diagnóstico manual — nunca se usa como fuente de datos del
 * mapa operativo (`/api/argus/events` lee la persistencia canónica
 * directamente, ver ese route.ts).
 */

const senapredSource = chileSources.find((source) => source.id === "senapred_eventos");
if (!senapredSource) throw new Error("Chile source pack is missing 'senapred_eventos'");

function mapEventType(variableRiesgoNombre?: string): ArgusEventType {
  const normalized = (variableRiesgoNombre ?? "").toLowerCase();
  if (normalized.includes("viento")) return "SEVERE_WEATHER";
  if (normalized.includes("helada")) return "SEVERE_WEATHER";
  if (normalized.includes("tormenta")) return "SEVERE_WEATHER";
  if (normalized.includes("calor")) return "SEVERE_WEATHER";
  if (normalized.includes("lluvia") || normalized.includes("precipitac")) return "HEAVY_RAIN";
  if (normalized.includes("crecida") || normalized.includes("inundac") || normalized.includes("aluvion")) return "FLOOD";
  if (normalized.includes("remocion") || normalized.includes("derrumbe") || normalized.includes("deslizamiento")) return "LANDSLIDE";
  if (normalized.includes("incendio")) return "WILDFIRE";
  if (normalized.includes("sismo") || normalized.includes("terremoto")) return "EARTHQUAKE";
  if (normalized.includes("tsunami") || normalized.includes("maremoto")) return "TSUNAMI";
  if (normalized.includes("volcan")) return "VOLCANIC_ACTIVITY";
  // SENAPRED tags most region-wide meteorological monitoreos as "Otros" —
  // in practice these are the DMC-sourced weather-system alerts.
  return "SEVERE_WEATHER";
}

/**
 * `status` (active/risk/observation/monitoring) has no equivalent in the
 * shared classifier, so it stays local to this adapter — only `severity`
 * comes from `classifySeverityFromLevel` (also what `alertPromotionEngine`
 * uses), so the same alert text can never disagree on severity depending on
 * which reader sees it first.
 */
function statusFromTipoAlerta(tipoAlertaNombre?: string): ArgusEventStatus {
  const normalized = (tipoAlertaNombre ?? "").toLowerCase();
  if (normalized.includes("roja")) return "active";
  if (normalized.includes("naranja")) return "risk";
  if (normalized.includes("amarilla")) return "risk";
  if (normalized.includes("temprana preventiva") || normalized.includes("alerta temprana")) return "observation";
  if (normalized.includes("verde")) return "monitoring";
  return "monitoring";
}

export function severityFromTipoAlerta(tipoAlertaNombre?: string) {
  const severity = classifySeverityFromLevel(tipoAlertaNombre ?? "");
  return severity === "unknown" ? "medium" : severity;
}

type SenapredFetchResult = {
  adapterId: "senapredEventosAdapter";
  sourceId: "senapred_eventos";
  status: "ready" | "error" | "empty" | "partial";
  fetchedAt: string;
  fetched: number;
  count: number;
  signals: OfficialAlertSignal[];
  warnings: string[];
  errors: string[];
};

export type SenapredFetchParams = {
  /** ISO date. Defaults to 30 days back. */
  fromDate?: string;
  /** ISO date. Defaults to now. */
  toDate?: string;
  /** Filter to alerts touching these region names (as returned by SENAPRED's own reference tables). */
  regionCodes?: string[];
  /** Preserved for API compatibility — `fetchChileOfficialAlertsRaw` bounds its own pagination internally. */
  maxPages?: number;
};

function areaKeyFor(alert: ChileOfficialAlertRaw): string {
  return alert.commune ?? alert.province ?? alert.region ?? "chile";
}

/**
 * SENAPRED no retracta filas superadas: publica una nueva ("Se cancela
 * Alerta Amarilla y declara Alerta Roja..."). Para esta vista de "alertas
 * vigentes ahora mismo", se conserva solo la más reciente por área afectada
 * — la persistencia canónica (`alertPromotionEngine.ts`) no necesita este
 * paso porque cada fila vive con su propio lifecycle, pero esta proyección
 * de lectura sin estado sí lo necesita para no mostrar alertas ya
 * reemplazadas como si siguieran vigentes.
 */
function latestPerArea(alerts: ChileOfficialAlertRaw[]): ChileOfficialAlertRaw[] {
  const latest = new Map<string, ChileOfficialAlertRaw>();
  for (const alert of alerts) {
    const key = areaKeyFor(alert);
    const existing = latest.get(key);
    if (!existing || new Date(alert.issuedAt).getTime() > new Date(existing.issuedAt).getTime()) {
      latest.set(key, alert);
    }
  }
  return Array.from(latest.values());
}

const PRECISION_BY_LEVEL = {
  commune: "administrative_commune",
  province: "administrative_province",
  region: "administrative_region",
} as const;

/**
 * Returns `null` (never a fabricated/mis-located marker) when no real
 * administrative boundary matches — same safety posture the previous
 * adapter had (it dropped alerts it couldn't geometrically resolve), now
 * just backed by the real polygon resolver instead of a hardcoded
 * region-codigo → anchor-point table (Prompt 14 §14: no bbox, no
 * hand-estimated shape standing in for a real boundary).
 */
function normalizeAlertToSignal(alert: ChileOfficialAlertRaw): OfficialAlertSignal | null {
  const resolved = resolveAdministrativeAreaWithFallback("CL", {
    commune: alert.commune,
    province: alert.province,
    region: alert.region,
  });
  if (!resolved) return null;

  const severity = severityFromTipoAlerta(alert.levelText);
  const status = statusFromTipoAlerta(alert.levelText);
  const eventType = mapEventType(alert.threatText);
  const publishedAt = new Date(alert.issuedAt).toISOString();

  return {
    kind: "official_alert",
    country: "CL",
    region: alert.region,
    province: alert.province,
    commune: alert.commune,
    eventType,
    severity,
    status,
    title: alert.title,
    operationalSummary: alert.threatText.slice(0, 900),
    geometry: { type: "administrative_area", geojson: resolved.geojson, regionNames: resolved.regionNames, anchor: resolved.anchor },
    geometryPrecision: PRECISION_BY_LEVEL[resolved.resolvedLevel],
    publishedAt,
    validFrom: publishedAt,
    sources: [senapredSource!],
    tags: ["senapred", "official_alert", alert.levelText.toLowerCase().replace(/\s+/g, "_") || "unknown_level"],
  };
}

export async function fetchSenapredAlerts(params: SenapredFetchParams = {}): Promise<SenapredFetchResult> {
  const { alerts, warnings, errors } = await fetchChileOfficialAlertsRaw({
    fromDate: params.fromDate,
    toDate: params.toDate,
  }).catch((error) => ({
    alerts: [] as ChileOfficialAlertRaw[],
    warnings: [] as string[],
    errors: [error instanceof Error ? error.message : "Failed to fetch SENAPRED alerts"],
  }));

  if (errors.length > 0 && alerts.length === 0) {
    return {
      adapterId: "senapredEventosAdapter",
      sourceId: "senapred_eventos",
      status: "error",
      fetchedAt: new Date().toISOString(),
      fetched: 0,
      count: 0,
      signals: [],
      warnings,
      errors,
    };
  }

  const regionFilter = params.regionCodes?.length ? new Set(params.regionCodes) : null;
  const currentAlerts = latestPerArea(alerts).filter(
    (alert) => !regionFilter || (alert.region && regionFilter.has(alert.region))
  );
  const signals = currentAlerts
    .map((alert) => normalizeAlertToSignal(alert))
    .filter((signal): signal is OfficialAlertSignal => Boolean(signal));

  return {
    adapterId: "senapredEventosAdapter",
    sourceId: "senapred_eventos",
    status: signals.length > 0 ? (errors.length > 0 ? "partial" : "ready") : errors.length > 0 ? "error" : "empty",
    fetchedAt: new Date().toISOString(),
    fetched: alerts.length,
    count: signals.length,
    signals,
    warnings,
    errors,
  };
}
