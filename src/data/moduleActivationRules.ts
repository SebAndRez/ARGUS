import type { GlobalThreatType } from "@/lib/vigia/threatClassifier";
import type { ArgusSeverity } from "@/types/argusEvent";

/**
 * ARGUS — reglas declarativas de recomendación de módulos.
 *
 * Referencia el registro de módulos existente (`src/data/argusModules.ts`,
 * slugs) — no crea un registro paralelo. No fuerza navegación (los módulos
 * siguen siendo páginas de navegación manual, ver auditoría de módulos): esto
 * solo calcula QUÉ módulos son relevantes para un incidente dado, para que la
 * UI (ATLAS/Command Center) muestre un enlace directo en vez de depender de
 * que un operador humano recuerde qué módulo abrir.
 *
 * `nexus` nunca se recomienda (cero implementación, confirmado en
 * auditoría). `custos` solo se recomienda para disturbios civiles — su
 * acceso ya está restringido a rol policial en `moduleAccess.ts`, esta regla
 * no cambia esa restricción.
 */

const SEVERITY_ORDER: Record<ArgusSeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function severityAtLeast(value: ArgusSeverity, threshold: ArgusSeverity): boolean {
  return SEVERITY_ORDER[value] >= SEVERITY_ORDER[threshold];
}

export type ModuleActivationRule = {
  id: string;
  threat: GlobalThreatType;
  minSeverity: ArgusSeverity;
  modules: string[];
};

export const MODULE_ACTIVATION_RULES: ModuleActivationRule[] = [
  { id: "wildfire_response", threat: "WILDFIRE", minSeverity: "high", modules: ["fenix", "hermes", "arca"] },
  { id: "earthquake_response", threat: "EARTHQUAKE", minSeverity: "high", modules: ["fenix", "hermes", "arca", "aura"] },
  { id: "tsunami_response", threat: "TSUNAMI", minSeverity: "medium", modules: ["hermes", "arca"] },
  { id: "flood_response", threat: "FLOOD", minSeverity: "medium", modules: ["hermes", "arca"] },
  { id: "landslide_response", threat: "LANDSLIDE", minSeverity: "medium", modules: ["hermes", "arca"] },
  { id: "volcano_response", threat: "VOLCANO", minSeverity: "high", modules: ["fenix", "hermes", "arca"] },
  { id: "cyclone_response", threat: "CYCLONE", minSeverity: "high", modules: ["hermes", "arca", "vesta"] },
  { id: "severe_weather_response", threat: "SEVERE_WEATHER", minSeverity: "high", modules: ["hermes", "arca"] },
  { id: "severe_wind_response", threat: "SEVERE_WIND", minSeverity: "high", modules: ["hermes"] },
  { id: "tornado_response", threat: "TORNADO", minSeverity: "medium", modules: ["hermes", "arca"] },
  { id: "waterspout_response", threat: "WATERSPOUT", minSeverity: "medium", modules: ["hermes"] },
  { id: "humanitarian_crisis_response", threat: "HUMANITARIAN_CRISIS", minSeverity: "low", modules: ["arca", "aura", "oraculo"] },
  { id: "infrastructure_damage_response", threat: "INFRASTRUCTURE_DAMAGE", minSeverity: "medium", modules: ["hermes"] },
  { id: "rescue_operation_response", threat: "RESCUE_OPERATION", minSeverity: "low", modules: ["hermes", "arca"] },
  { id: "civil_unrest_response", threat: "CIVIL_UNREST", minSeverity: "medium", modules: ["custos", "oraculo"] },
];

/** Módulos siempre añadidos cuando el incidente es un padre multi-amenaza (varias reglas ya lo cubren, pero ATLAS/VESTA aplican transversalmente). */
export const MULTI_HAZARD_PARENT_MODULES = ["atlas", "vesta"];
