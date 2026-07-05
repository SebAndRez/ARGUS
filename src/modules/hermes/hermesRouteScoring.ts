import type {
  HermesBlockage,
  HermesGeoPoint,
  HermesRiskZone,
  HermesRoute,
  HermesRouteConfidence,
  HermesRouteScoreResult,
  HermesRouteWarning,
} from "@/modules/hermes/types";

function distanceMeters(a: HermesGeoPoint, b: HermesGeoPoint): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function pointNearGeometry(point: HermesGeoPoint, geometry: HermesGeoPoint[], radiusMeters: number): boolean {
  return geometry.some((vertex) => distanceMeters(vertex, point) <= radiusMeters);
}

const severityPenalty: Record<HermesBlockage["severity"], number> = { low: 6, medium: 14, high: 24, critical: 38 };
const riskZonePenalty: Record<HermesRiskZone["riskLevel"], number> = {
  minimal: 0,
  low: 4,
  medium: 12,
  high: 24,
  critical: 40,
};

/**
 * Scoring de ruta HERMES: explicable y ajustable. No promete seguridad
 * absoluta — solo pondera bloqueos cercanos, zonas de riesgo TALOS,
 * evidencia/confianza y compatibilidad del modo de movilidad.
 */
export function scoreHermesRoute(
  route: Pick<HermesRoute, "geometry" | "mobilityMode" | "purpose">,
  context: {
    nearbyBlockages: HermesBlockage[];
    nearbyRiskZones: HermesRiskZone[];
    recentDataAvailable: boolean;
  }
): HermesRouteScoreResult {
  const reasons: string[] = [];
  const penalties: string[] = [];
  const warnings: HermesRouteWarning[] = [];
  let safetyScore = 85;
  let reliabilityScore = 55;

  const confirmedBlockages = context.nearbyBlockages.filter(
    (blockage) => blockage.status === "confirmed" && pointNearGeometry(blockage.location, route.geometry, blockage.affectedRadiusMeters ?? 250)
  );
  const reportedBlockages = context.nearbyBlockages.filter(
    (blockage) => blockage.status !== "confirmed" && pointNearGeometry(blockage.location, route.geometry, blockage.affectedRadiusMeters ?? 250)
  );

  if (confirmedBlockages.length === 0 && reportedBlockages.length === 0) {
    reasons.push("La ruta evita bloqueos confirmados y reportados conocidos.");
    safetyScore += 5;
  }

  confirmedBlockages.forEach((blockage) => {
    safetyScore -= severityPenalty[blockage.severity];
    penalties.push(`Bloqueo confirmado cercano (${blockage.type}).`);
    warnings.push({
      id: `warn-${blockage.id}`,
      type: blockage.type === "road_block" ? "road_block" : blockage.type === "fire" ? "fire_nearby" : blockage.type === "flood" ? "flood_nearby" : blockage.type === "landslide" ? "landslide_risk" : "unknown_condition",
      severity: blockage.severity,
      message: `Bloqueo confirmado (${blockage.type}) cerca del trazado.`,
      sourceModule: blockage.sourceModule === "MANUAL" ? undefined : blockage.sourceModule,
    });
  });

  reportedBlockages.forEach((blockage) => {
    safetyScore -= severityPenalty[blockage.severity] * 0.5;
    penalties.push(`Reporte sin confirmar de ${blockage.type} cerca de la ruta.`);
    warnings.push({
      id: `warn-${blockage.id}`,
      type: "conflicting_reports",
      severity: blockage.severity === "critical" ? "high" : blockage.severity,
      message: `Reporte sin confirmar de ${blockage.type} cerca del trazado.`,
      sourceModule: blockage.sourceModule === "MANUAL" ? undefined : blockage.sourceModule,
    });
  });

  const criticalZones = context.nearbyRiskZones.filter(
    (zone) => pointNearGeometry(zone.center, route.geometry, zone.radiusMeters) && (zone.riskLevel === "critical" || zone.riskLevel === "high")
  );
  criticalZones.forEach((zone) => {
    safetyScore -= riskZonePenalty[zone.riskLevel];
    penalties.push(`Cruza zona TALOS de riesgo ${zone.riskLevel} (${zone.category}).`);
    warnings.push({
      id: `warn-${zone.id}`,
      type: "critical_infrastructure",
      severity: zone.riskLevel === "critical" ? "critical" : "high",
      message: `Zona TALOS de riesgo ${zone.riskLevel} sobre el trazado (${zone.category}).`,
      sourceModule: "TALOS",
    });
  });

  const mediumZones = context.nearbyRiskZones.filter(
    (zone) => zone.riskLevel === "medium" && pointNearGeometry(zone.center, route.geometry, zone.radiusMeters)
  );
  if (mediumZones.length > 0) {
    safetyScore -= riskZonePenalty.medium * mediumZones.length;
    reasons.push("Se advierte zona TALOS de riesgo medio en el tramo.");
  }

  if (!context.recentDataAvailable) {
    reliabilityScore -= 20;
    penalties.push("Sin datos recientes en el tramo.");
    warnings.push({
      id: "warn-low-confidence",
      type: "low_confidence",
      severity: "medium",
      message: "Pocos datos recientes disponibles para este tramo.",
    });
  } else {
    reliabilityScore += 20;
    reasons.push("Existen reportes recientes que respaldan el estado de la ruta.");
  }

  if (context.nearbyBlockages.length === 0 && context.nearbyRiskZones.length === 0) {
    reliabilityScore += 5;
  }

  safetyScore = Math.max(0, Math.min(100, Math.round(safetyScore)));
  reliabilityScore = Math.max(0, Math.min(100, Math.round(reliabilityScore)));
  const riskScore = Math.max(0, Math.min(100, 100 - safetyScore));
  const routeScore = Math.round(safetyScore * 0.65 + reliabilityScore * 0.35);

  const confidence: HermesRouteConfidence =
    reliabilityScore >= 85 ? "verified" : reliabilityScore >= 65 ? "high" : reliabilityScore >= 40 ? "medium" : reliabilityScore >= 15 ? "low" : "unknown";

  return { routeScore, safetyScore, riskScore, reliabilityScore, confidence, reasons, penalties, warnings };
}
