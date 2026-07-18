import type { ArgusSeverity } from "@/types/argusEvent";

/**
 * ARGUS — reglas declarativas de correlación cross-amenaza ("incidente
 * maestro"). Esto es lo que el mandato original pide con el ejemplo del
 * sistema frontal (lluvia + alerta + evacuación + albergues + cortes → UN
 * incidente) y que ninguna correlación existente cubre: `mergeCorroboratingEvents`
 * y `wildfireCorrelationEngine.ts` (`src/lib/vigia/`) solo agrupan evidencia
 * de la MISMA amenaza vista por varias fuentes — nunca amenazas DISTINTAS
 * relacionadas por región/tiempo.
 *
 * Hallazgo concreto que motiva la primera regla: SENAPRED emite alertas
 * separadas por tipo de amenaza para un mismo sistema frontal (viento,
 * lluvia/inundación, etc.), y `chileAlertPromotionEngine.ts` genera un
 * `externalId` distinto por `threat:area:day` — hoy esas alertas quedan
 * como `KnowledgeIncident` independientes aunque sean la misma tormenta.
 *
 * Severidad/dominio se comparan usando el vocabulario ya persistido por
 * Fase C (`effectiveSeverity`/`domain`), no se reclasifica nada aquí.
 */

const SEVERITY_ORDER: Record<ArgusSeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function severityAtLeast(value: string | null, threshold: ArgusSeverity): boolean {
  if (!value || !(value in SEVERITY_ORDER)) return false;
  return SEVERITY_ORDER[value as ArgusSeverity] >= SEVERITY_ORDER[threshold];
}

/** Dominio sintético del incidente padre — nunca se usa como ancla ni como acompañante de sí mismo. */
export const MASTER_INCIDENT_PARENT_DOMAIN = "multi_hazard_event";
export const MASTER_INCIDENT_SOURCE_ID = "argus_fusion_engine";
export const MASTER_INCIDENT_SOURCE_NAME = "ARGUS Fusion Engine (correlación cross-amenaza)";

export type MasterIncidentRule = {
  id: string;
  description: string;
  /** Dominios que pueden actuar como ancla (disparan la búsqueda de acompañantes). */
  anchorDomains: string[];
  anchorMinSeverity: ArgusSeverity;
  /** `"any"` = cualquier dominio distinto del ancla y del propio padre califica como acompañante. */
  companionDomains: string[] | "any";
  windowHours: number;
  parentTitle: (region: string | null, country: string | null) => string;
};

const WEATHER_SYSTEM_DOMAINS = [
  "storm",
  "hurricane",
  "tornado",
  "waterspout",
  "severe_wind",
  "thunderstorm",
  "flood",
  "winter_storm",
  "weather_alert",
];

export const MASTER_INCIDENT_RULES: MasterIncidentRule[] = [
  {
    id: "severe_weather_system",
    description:
      "Sistema frontal / evento de mal tiempo: agrupa una alerta meteorológica alta+ con cualquier otro incidente " +
      "(inundación, deslizamiento, daño a infraestructura, crisis humanitaria, etc.) de la misma región dentro de la ventana.",
    anchorDomains: WEATHER_SYSTEM_DOMAINS,
    anchorMinSeverity: "high",
    companionDomains: "any",
    windowHours: 72,
    parentTitle: (region, country) =>
      `Sistema de mal tiempo${region ? ` — ${region}` : ""}${country && !region ? ` — ${country}` : ""}`,
  },
];
