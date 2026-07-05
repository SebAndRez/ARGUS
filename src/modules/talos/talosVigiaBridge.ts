import type { VigiaReport } from "@/modules/vigia/types";
import { isReportNearby } from "@/modules/vigia/utils";
import type { TalosVigiaSignal } from "@/modules/talos/types";

/**
 * Extrae señales de riesgo desde reportes VIGÍA, sin duplicar la lógica de
 * VIGÍA (reutiliza `isReportNearby`). Reglas:
 * - rechazados no suman;
 * - confirmados aumentan confianza;
 * - pendientes suman señal, pero no confianza fuerte;
 * - duplicados detectados no inflan artificialmente el riesgo (se cuentan
 *   aparte, no se excluyen del total de reportes).
 */
export function convertVigiaReportsToTalosSignals(reports: VigiaReport[]): TalosVigiaSignal {
  const active = reports.filter((report) => report.status !== "rejected");
  const recentThresholdMs = 3 * 60 * 60 * 1000;

  const confirmedCount = active.filter((report) => report.status === "confirmed").length;
  const criticalCount = active.filter((report) => report.severity === "critical").length;
  const recentCount = active.filter((report) => Date.now() - new Date(report.createdAt).getTime() <= recentThresholdMs).length;
  const reportsWithEvidence = active.filter((report) => report.evidence.length > 0).length;

  const averageReputation =
    active.length > 0
      ? Math.round(active.reduce((sum, report) => sum + report.reporter.reputationScore, 0) / active.length)
      : 0;

  let possibleDuplicates = 0;
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      if (
        active[i].type === active[j].type &&
        isReportNearby(active[i].location, active[j].location, 0.002) &&
        Math.abs(new Date(active[i].createdAt).getTime() - new Date(active[j].createdAt).getTime()) < 30 * 60 * 1000
      ) {
        possibleDuplicates += 1;
      }
    }
  }

  const primary = active[0];

  return {
    reportCount: active.length,
    confirmedCount,
    criticalCount,
    recentCount,
    averageReputation,
    reportsWithEvidence,
    possibleDuplicates,
    location: primary ? { lat: primary.location.lat, lng: primary.location.lng, label: primary.location.label, isApproximate: primary.location.isApproximate } : undefined,
    category: primary?.type,
  };
}
