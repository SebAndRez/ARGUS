import { calculateTalosRiskAssessment } from "@/modules/talos/talosScoring";
import type { TalosAssessmentEventInput, TalosEventCategory, TalosRiskAssessment } from "@/modules/talos/types";
import type { ArgusEventType } from "@/types/argusEvent";
import type { ModuleIncidentSummary } from "@/types/moduleOperationalContext";

/**
 * ARGUS Prompt 17 §14 — TALOS sobre un incidente canónico.
 *
 * No se creó un motor nuevo: `calculateTalosRiskAssessment` (el motor de
 * riesgo ya existente y probado) se reutiliza sin cambios. Este archivo es
 * únicamente el adaptador de entrada (`ModuleIncidentSummary` →
 * `TalosAssessmentEventInput`, análogo al ya existente `talosVigiaBridge.ts`
 * para reportes ciudadanos) y de salida (envuelve el resultado con los
 * metadatos que el Prompt 17 exige: `status`, separación observado/
 * estimado/supuestos, `isOfficial: false`).
 */

const EVENT_TYPE_TO_TALOS_CATEGORY: Record<ArgusEventType, TalosEventCategory> = {
  EARTHQUAKE: "earthquake",
  TSUNAMI: "tsunami",
  WILDFIRE: "fire",
  FLOOD: "flood",
  LANDSLIDE: "landslide",
  VOLCANIC_ACTIVITY: "volcano",
  SEVERE_WEATHER: "weather",
  HEAVY_RAIN: "weather",
  TORNADO: "weather",
  WATERSPOUT: "weather",
  SEVERE_WIND: "weather",
  ROAD_CLOSURE: "traffic",
  POWER_OUTAGE: "infrastructure",
  INFRASTRUCTURE_FAILURE: "infrastructure",
  STRUCTURAL_COLLAPSE: "infrastructure",
  ROOF_COLLAPSE: "infrastructure",
  BUILDING_COLLAPSE: "infrastructure",
  CIVIL_UNREST: "public_security",
  CONFLICT: "conflict",
  HEALTH_EMERGENCY: "medical",
  OFFICIAL_ALERT: "other",
  NEWS_REPORTED_INCIDENT: "other",
  CITIZEN_REPORT: "other",
  RISK_ZONE: "other",
  COASTAL_HAZARD: "other",
};

export function mapCanonicalIncidentToTalosCategory(type: ArgusEventType): TalosEventCategory {
  return EVENT_TYPE_TO_TALOS_CATEGORY[type] ?? "other";
}

export function buildTalosAssessmentInputFromCanonicalIncident(summary: ModuleIncidentSummary): TalosAssessmentEventInput {
  return {
    id: summary.id,
    title: summary.title,
    category: mapCanonicalIncidentToTalosCategory(summary.type),
    severity: summary.severity,
    status: summary.lifecycle,
    createdAt: summary.timing.startedAt ?? summary.timing.updatedAt,
    updatedAt: summary.timing.updatedAt,
    location: {
      lat: summary.location.latitude ?? undefined,
      lng: summary.location.longitude ?? undefined,
      label: summary.location.regionCode ?? summary.location.countryCode ?? undefined,
    },
  };
}

/**
 * Vista de entrega de TALOS sobre un incidente canónico (Prompt 17 §14) —
 * separa explícitamente dato observado (el propio incidente canónico) de
 * estimación (el resultado del motor de riesgo), nunca convierte ausencia
 * de contexto adicional en "impacto cero".
 */
export type TalosCanonicalAssessmentView = {
  incidentId: string;
  status: "available" | "insufficient_data";
  assessment: TalosRiskAssessment | null;
  assumptions: string[];
  confidence: TalosRiskAssessment["confidence"] | null;
  generatedAt: string;
  isOfficial: false;
};

export function buildTalosCanonicalAssessmentView(summary: ModuleIncidentSummary): TalosCanonicalAssessmentView {
  if (summary.location.latitude === null || summary.location.longitude === null) {
    return {
      incidentId: summary.id,
      status: "insufficient_data",
      assessment: null,
      assumptions: ["No hay geometría puntual suficiente para estimar impacto territorial."],
      confidence: null,
      generatedAt: new Date().toISOString(),
      isOfficial: false,
    };
  }

  const assessment = calculateTalosRiskAssessment({ event: buildTalosAssessmentInputFromCanonicalIncident(summary) });
  return {
    incidentId: summary.id,
    status: "available",
    assessment,
    assumptions: [
      "Estimación basada únicamente en severidad/lifecycle/geometría del incidente canónico — sin señales de VIGÍA/ORÁCULO adicionales todavía cargadas.",
      "No representa daño confirmado ni una orden de autoridad — es una estimación operacional de TALOS.",
    ],
    confidence: assessment.confidence,
    generatedAt: new Date().toISOString(),
    isOfficial: false,
  };
}
