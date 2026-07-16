/**
 * Estructura base de "ruta segura" para el sistema de navegacion general de
 * ARGUS. No es un motor de riesgo avanzado (eso es TALOS/HERMES): calcula un
 * riskScore aproximado contando cuantos incidentes/zonas de riesgo pasan
 * cerca de la geometria de una ruta, para poder elegir la alternativa que
 * menos los toca y explicarlo en un routeSafetyLabel.
 */

import type { ArgusIngestionSeverity } from "@/types/ingestion";

/** @deprecated Value-identical to `ArgusIngestionSeverity` — use that directly in new code. Kept as an alias (Prompt 20 cleanup) since this name has no external consumers of its own but renaming every local reference isn't necessary for the consolidation. */
export type RouteHazardSeverity = ArgusIngestionSeverity;

export type RouteHazardPoint = {
  id: string;
  label?: string;
  lat: number;
  lng: number;
  severity: RouteHazardSeverity;
  /** Radio de influencia; si no se entrega se usa un valor por defecto segun severidad. */
  radiusMeters?: number;
};

const DEFAULT_RADIUS_METERS: Record<RouteHazardSeverity, number> = {
  low: 250,
  medium: 400,
  high: 600,
  critical: 800,
};

const SEVERITY_WEIGHT: Record<RouteHazardSeverity, number> = {
  low: 6,
  medium: 14,
  high: 26,
  critical: 42,
};

function haversineMeters(a: [number, number], b: [number, number]): number {
  const radiusM = 6371000;
  const [lat1, lng1] = a;
  const [lat2, lng2] = b;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const rLat1 = (lat1 * Math.PI) / 180;
  const rLat2 = (lat2 * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(rLat1) * Math.cos(rLat2);
  return 2 * radiusM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distancia minima (m) entre un punto y una polilinea, muestreando sus vertices. */
function minDistanceToGeometryMeters(point: [number, number], geometry: Array<[number, number]>): number {
  if (geometry.length === 0) return Infinity;
  const step = Math.max(1, Math.floor(geometry.length / 400));
  let min = Infinity;
  for (let i = 0; i < geometry.length; i += step) {
    const d = haversineMeters(point, geometry[i]);
    if (d < min) min = d;
  }
  return min;
}

export type RouteRiskAssessment = {
  riskScore: number;
  nearHazardIds: string[];
  warnings: string[];
};

export function scoreRouteRisk(
  geometry: Array<[number, number]>,
  hazards: RouteHazardPoint[]
): RouteRiskAssessment {
  const nearHazardIds: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  for (const hazard of hazards) {
    const threshold = hazard.radiusMeters ?? DEFAULT_RADIUS_METERS[hazard.severity];
    const distance = minDistanceToGeometryMeters([hazard.lat, hazard.lng], geometry);
    if (distance <= threshold) {
      nearHazardIds.push(hazard.id);
      score += SEVERITY_WEIGHT[hazard.severity];
      warnings.push(`Cerca de ${hazard.label ?? "incidente reportado"} (${hazard.severity})`);
    }
  }

  return { riskScore: Math.min(100, Math.round(score)), nearHazardIds, warnings };
}

/** Etiqueta legible tipo "Ruta segura: evita 2 incidentes reportados. ETA +4 min." */
export function buildRouteSafetyLabel(
  safeAvoidedCount: number,
  safeDurationMin: number,
  fastestDurationMin: number
): string {
  if (safeAvoidedCount <= 0) {
    return "Sin incidentes reportados cerca de la ruta.";
  }
  const etaDelta = Math.round(safeDurationMin - fastestDurationMin);
  const etaText = etaDelta > 0 ? `ETA +${etaDelta} min` : etaDelta < 0 ? `ETA ${etaDelta} min` : "misma ETA";
  const incidentWord = safeAvoidedCount === 1 ? "incidente reportado" : "incidentes reportados";
  return `Ruta segura: evita ${safeAvoidedCount} ${incidentWord}. ${etaText}.`;
}
