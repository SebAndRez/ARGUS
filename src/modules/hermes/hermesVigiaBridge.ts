import type { VigiaReport, VigiaReportType } from "@/modules/vigia/types";
import { isReportNearby } from "@/modules/vigia/utils";
import type { HermesBlockage, HermesBlockageType, HermesRouteConfidence } from "@/modules/hermes/types";

const mobilityAffectingTypes: VigiaReportType[] = [
  "road_block",
  "traffic_accident",
  "flood",
  "landslide",
  "fire",
  "infrastructure_damage",
];

const typeMap: Partial<Record<VigiaReportType, HermesBlockageType>> = {
  road_block: "road_block",
  traffic_accident: "traffic_accident",
  flood: "flood",
  landslide: "landslide",
  fire: "fire",
  infrastructure_damage: "infrastructure_damage",
};

const STALE_HOURS = 12;

/**
 * Convierte reportes VIGÍA que afectan movilidad (corte de ruta, accidente,
 * inundación, derrumbe, incendio, infraestructura dañada) en `HermesBlockage`.
 * Reglas:
 * - rechazados no aparecen;
 * - confirmados suben confianza; pendientes quedan "reported";
 * - duplicados se agrupan (no se listan aparte);
 * - antiguos bajan confianza;
 * - con evidencia visual suben confianza.
 */
export function convertVigiaReportsToHermesBlockages(reports: VigiaReport[]): HermesBlockage[] {
  const relevant = reports.filter(
    (report) => report.status !== "rejected" && mobilityAffectingTypes.includes(report.type)
  );

  const grouped: VigiaReport[] = [];
  relevant.forEach((report) => {
    const duplicateOf = grouped.find(
      (candidate) =>
        candidate.type === report.type &&
        isReportNearby(candidate.location, report.location, 0.003) &&
        Math.abs(new Date(candidate.createdAt).getTime() - new Date(report.createdAt).getTime()) < 45 * 60 * 1000
    );
    if (!duplicateOf) grouped.push(report);
  });

  return grouped.map((report) => {
    const ageHours = (Date.now() - new Date(report.createdAt).getTime()) / 3_600_000;

    let confidence: HermesRouteConfidence = "low";
    if (report.status === "confirmed") confidence = "high";
    else if (report.status === "escalated") confidence = "medium";
    if (report.evidence.length > 0 && confidence !== "high") confidence = "medium";
    if (ageHours > STALE_HOURS) {
      confidence = confidence === "high" ? "medium" : "low";
    }

    const status: HermesBlockage["status"] =
      report.status === "confirmed" || report.status === "escalated"
        ? "confirmed"
        : report.status === "duplicate"
          ? "disputed"
          : "reported";

    return {
      id: `hermes-blockage-vigia-${report.id}`,
      type: typeMap[report.type] ?? "unknown",
      status,
      severity: report.severity,
      location: { lat: report.location.lat, lng: report.location.lng, label: report.location.label, isApproximate: report.location.isApproximate },
      sourceModule: "VIGIA",
      sourceId: report.id,
      confidence,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    };
  });
}
