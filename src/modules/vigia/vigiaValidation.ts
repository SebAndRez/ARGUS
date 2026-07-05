import type { VigiaConfidence, VigiaReport, VigiaReportStatus, VigiaValidationResult } from "@/modules/vigia/types";
import { isReportNearby, vigiaSeverityRank } from "@/modules/vigia/utils";

const REPORT_AGE_STALE_HOURS = 12;

/**
 * Evaluación base de confianza de un reporte VIGÍA. No reemplaza a TALOS
 * (riesgo avanzado) ni a ORÁCULO (fusión de fuentes) — solo produce una
 * primera señal de confianza/estado sugerido a partir de señales locales
 * disponibles hoy (reputación del reportante, evidencia, cercanía con otros
 * reportes, antigüedad).
 */
export function evaluateVigiaReport(
  report: VigiaReport,
  context: { allReports?: VigiaReport[] } = {}
): VigiaValidationResult {
  const reasons: string[] = [];
  const flags: string[] = [];
  let score = 40;

  if (report.reporter.isVerified) {
    score += 15;
    reasons.push("Usuario verificado.");
  }
  if (report.reporter.reputationScore >= 70) {
    score += 15;
    reasons.push("Usuario verificado con reputación alta.");
  } else if (report.reporter.reputationScore > 0 && report.reporter.reputationScore < 30) {
    score -= 10;
    reasons.push("Reporte sin evidencia y usuario nuevo.");
  }

  if (report.evidence.length > 0) {
    score += 20;
    reasons.push("Reporte contiene evidencia visual.");
  } else {
    flags.push("no_evidence");
  }

  const otherReports = (context.allReports ?? []).filter((candidate) => candidate.id !== report.id);
  const nearbySimilar = otherReports.filter(
    (candidate) => candidate.type === report.type && isReportNearby(candidate.location, report.location)
  );
  if (nearbySimilar.length > 0) {
    score += Math.min(15, nearbySimilar.length * 5);
    reasons.push("Existen reportes similares en la zona.");
  }

  const possibleDuplicate = otherReports.find(
    (candidate) =>
      candidate.type === report.type &&
      isReportNearby(candidate.location, report.location, 0.002) &&
      Math.abs(new Date(candidate.createdAt).getTime() - new Date(report.createdAt).getTime()) < 30 * 60 * 1000
  );
  if (possibleDuplicate) {
    flags.push("possible_duplicate");
    reasons.push("Posible duplicado.");
  }

  const ageHours = (Date.now() - new Date(report.createdAt).getTime()) / 3_600_000;
  if (ageHours > REPORT_AGE_STALE_HOURS) {
    score -= 10;
    flags.push("stale_report");
  }

  if (vigiaSeverityRank[report.severity] >= vigiaSeverityRank.high && report.evidence.length === 0) {
    flags.push("high_severity_no_evidence");
  }

  score = Math.max(0, Math.min(100, score));

  const confidence: VigiaConfidence =
    score >= 85 ? "verified" : score >= 65 ? "high" : score >= 45 ? "medium" : score >= 20 ? "low" : "unknown";

  let suggestedStatus: VigiaReportStatus = "pending_validation";
  if (flags.includes("possible_duplicate")) suggestedStatus = "duplicate";
  else if (confidence === "verified" || confidence === "high") suggestedStatus = "confirmed";
  else if (confidence === "unknown" && flags.includes("no_evidence")) suggestedStatus = "under_review";

  return { confidence, suggestedStatus, score, reasons, flags };
}
