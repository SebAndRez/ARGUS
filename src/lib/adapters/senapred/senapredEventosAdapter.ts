import { chileSources } from "@/data/countrySourcePacks/chile";
import type { ArgusEventType, ArgusSeverity, ArgusEventStatus } from "@/types/argusEvent";
import type { OfficialAlertSignal } from "@/lib/normalizers/argusEventNormalizer";
import {
  fetchAlertasByDatePage,
  fetchSenapredReferenceTables,
  type SenapredAlertaRecord,
} from "@/lib/adapters/senapred/senapredGraphqlClient";
import { classifySeverityFromLevel } from "@/lib/weather/severeWeatherClassifier";

const senapredSource = chileSources.find((source) => source.id === "senapred_eventos");
if (!senapredSource) throw new Error("Chile source pack is missing 'senapred_eventos'");

/** Representative city-center anchor per region code, keyed by SENAPRED's own `codigo` (Roman numeral) — there is no official region polygon behind this, only a camera-centering point (`geometryPrecision: "administrative_region"`). */
const REGION_ANCHOR_BY_CODIGO: Record<string, { displayName: string; anchor: [number, number] }> = {
  I: { displayName: "Tarapacá", anchor: [-20.2141, -70.1522] },
  II: { displayName: "Antofagasta", anchor: [-23.6509, -70.3975] },
  III: { displayName: "Atacama", anchor: [-27.3668, -70.3323] },
  IV: { displayName: "Coquimbo", anchor: [-29.9027, -71.2519] },
  V: { displayName: "Valparaíso", anchor: [-33.0472, -71.6127] },
  VI: { displayName: "O'Higgins", anchor: [-34.1708, -70.7444] },
  VII: { displayName: "Maule", anchor: [-35.4264, -71.6554] },
  VIII: { displayName: "Biobío", anchor: [-36.8201, -73.0444] },
  IX: { displayName: "La Araucanía", anchor: [-38.7359, -72.5904] },
  X: { displayName: "Los Lagos", anchor: [-41.4693, -72.9424] },
  XI: { displayName: "Aysén", anchor: [-45.5712, -72.0685] },
  XII: { displayName: "Magallanes", anchor: [-53.1638, -70.9171] },
  XIII: { displayName: "Metropolitana", anchor: [-33.4489, -70.6693] },
  XIV: { displayName: "Los Ríos", anchor: [-39.8142, -73.2459] },
  XV: { displayName: "Arica y Parinacota", anchor: [-18.4783, -70.3126] },
  XVI: { displayName: "Ñuble", anchor: [-36.6062, -72.1034] },
};

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
 * comes from `classifySeverityFromLevel` now (see import above), which is
 * also what `alertPromotionEngine` uses, so the same alert text can never
 * disagree on severity depending on which pipeline reads it first.
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

/** `classifySeverityFromLevel` is typed `ArgusIncidentSeverity` (includes `"unknown"`, for knowledge-intake domains that never apply to a SENAPRED `tipoAlerta.nombre`); this adapter's `ArgusSeverity` has no `"unknown"`, so it's defensively mapped to `"medium"` — never actually hit given the classifier's own fallback already returns `"medium"`, not `"unknown"`. Exported (not just internal) so tests can assert parity against `classifySeverityFromLevel` directly instead of duplicating the assumption. */
export function severityFromTipoAlerta(tipoAlertaNombre?: string): ArgusSeverity {
  const severity = classifySeverityFromLevel(tipoAlertaNombre ?? "");
  return severity === "unknown" ? "medium" : severity;
}

function stripHtml(value?: string): string {
  return (value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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
  /** Filter to alerts touching these region codes (Roman numerals, e.g. "IX", "XIV", "X"). */
  regionCodes?: string[];
  /** Max pages of 100 to walk (safety bound — SENAPRED currently has hundreds of historical rows under isActive:true). */
  maxPages?: number;
};

function normalizeAlertaToSignal(alerta: SenapredAlertaRecord): OfficialAlertSignal | null {
  const codigos = alerta.regionesIds.map((id) => regionIdToCodigo.get(id)).filter((codigo): codigo is string => Boolean(codigo));
  if (codigos.length === 0) return null;

  const regionInfos = codigos.map((codigo) => REGION_ANCHOR_BY_CODIGO[codigo]).filter(Boolean);
  if (regionInfos.length === 0) return null;

  const regionNames = regionInfos.map((info) => info.displayName);
  const anchor = regionInfos[0].anchor;
  const severity = severityFromTipoAlerta(alerta.variableRiesgo?.tipoAlerta?.nombre);
  const status = statusFromTipoAlerta(alerta.variableRiesgo?.tipoAlerta?.nombre);
  const eventType = mapEventType(alerta.variableRiesgo?.nombre);
  const publishedAt = new Date(alerta.fechaHora).toISOString();
  const summary = stripHtml(alerta.contenido).slice(0, 900) || stripHtml(alerta.titulo);

  return {
    kind: "official_alert",
    country: "CL",
    region: regionNames.join(", "),
    eventType,
    severity,
    status,
    title: stripHtml(alerta.titulo),
    operationalSummary: summary,
    geometry: { type: "region_reference", anchor, regionNames },
    geometryPrecision: "administrative_region",
    publishedAt,
    validFrom: publishedAt,
    sources: [senapredSource!],
    tags: ["senapred", "official_alert", alerta.variableRiesgo?.tipoAlerta?.nombre?.toLowerCase().replace(/\s+/g, "_") ?? "unknown_level"],
  };
}

// Populated by `fetchSenapredAlerts` before normalizing, since region id -> codigo
// resolution requires an async reference-table fetch.
let regionIdToCodigo = new Map<string, string>();

export async function fetchSenapredAlerts(params: SenapredFetchParams = {}): Promise<SenapredFetchResult> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const now = new Date();
  const fromDate = params.fromDate ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const toDate = params.toDate ?? now.toISOString();
  const maxPages = params.maxPages ?? 5;

  let referenceTables;
  try {
    referenceTables = await fetchSenapredReferenceTables();
  } catch (error) {
    return {
      adapterId: "senapredEventosAdapter",
      sourceId: "senapred_eventos",
      status: "error",
      fetchedAt: new Date().toISOString(),
      fetched: 0,
      count: 0,
      signals: [],
      warnings,
      errors: [error instanceof Error ? error.message : "Failed to load SENAPRED region reference tables"],
    };
  }
  regionIdToCodigo = new Map(referenceTables.Region.map((region) => [region.id, region.codigo]));

  const allItems: SenapredAlertaRecord[] = [];
  let nextToken: string | null = null;
  let page = 0;
  do {
    const result = await fetchAlertasByDatePage({ fromDate, toDate, nextToken });
    if (result.errors.length > 0) {
      errors.push(...result.errors);
      break;
    }
    allItems.push(...result.items);
    nextToken = result.nextToken;
    page += 1;
  } while (nextToken && page < maxPages);

  if (nextToken) warnings.push(`Stopped after ${maxPages} pages; more SENAPRED alerts may exist in range.`);

  const regionCodeFilter = params.regionCodes?.length ? new Set(params.regionCodes) : null;

  // Only the most recent alert per affected region is the currently-effective
  // one — SENAPRED does not retract superseded rows, it just publishes a new
  // one (e.g. "Se cancela Alerta Amarilla y declara Alerta Roja...").
  const latestByRegionCodigo = new Map<string, SenapredAlertaRecord>();
  for (const alerta of allItems) {
    for (const regionId of alerta.regionesIds) {
      const codigo = regionIdToCodigo.get(regionId);
      if (!codigo) continue;
      if (regionCodeFilter && !regionCodeFilter.has(codigo)) continue;
      const existing = latestByRegionCodigo.get(codigo);
      if (!existing || new Date(alerta.fechaHora).getTime() > new Date(existing.fechaHora).getTime()) {
        latestByRegionCodigo.set(codigo, alerta);
      }
    }
  }

  const uniqueAlertIds = new Set(Array.from(latestByRegionCodigo.values()).map((alerta) => alerta.id));
  const currentAlerts = allItems.filter((alerta) => uniqueAlertIds.has(alerta.id));

  const signals = currentAlerts
    .map((alerta) => normalizeAlertaToSignal(alerta))
    .filter((signal): signal is OfficialAlertSignal => Boolean(signal));

  return {
    adapterId: "senapredEventosAdapter",
    sourceId: "senapred_eventos",
    status: signals.length > 0 ? (errors.length > 0 ? "partial" : "ready") : errors.length > 0 ? "error" : "empty",
    fetchedAt: new Date().toISOString(),
    fetched: allItems.length,
    count: signals.length,
    signals,
    warnings,
    errors,
  };
}
