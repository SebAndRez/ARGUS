import {
  calculateAntiAbuseCap,
  calculateReportQualityRatio,
} from "@/lib/trust/antiAbuseRules";
import type { TrustBand, UserTrustStats } from "@/types/trustAchievements";

export function getTrustBand(
  score: number,
  stats: Pick<UserTrustStats, "accountStatus" | "strikes" | "reportsCreated">
): TrustBand {
  if (["BANNED", "SUSPENDED", "LIMITED"].includes(stats.accountStatus)) {
    return "LIMITED";
  }
  if (stats.accountStatus === "WATCHED" || stats.strikes >= 2) return "WATCHLIST";
  if (stats.reportsCreated < 2) return "NEW";
  if (score < 35) return "LOW";
  if (score < 70) return "NORMAL";
  if (score < 86) return "TRUSTED";
  return "HIGH_TRUST";
}

export function calculateTrustScore(
  stats: UserTrustStats,
  achievementContribution = 0
) {
  const reportQuality = calculateReportQualityRatio(stats);
  const reportScore = reportQuality * 60;
  const externalScore = Math.min(
    20,
    stats.officialCorrelations * 4 + stats.independentConfirmations * 1.2
  );
  const identityScore =
    (stats.verifiedIdentity ? 6 : 2) + Math.min(4, stats.cleanHistoryUnits / 10);
  const achievements = Math.min(10, Math.max(0, achievementContribution));
  const penalties =
    stats.falseReports * 18 +
    stats.duplicateReports * 3 +
    stats.rejectedReports * 4 +
    stats.strikes * 8;
  const rawScore = reportScore + externalScore + identityScore + achievements - penalties;
  const cap = calculateAntiAbuseCap(stats);
  return Math.max(0, Math.min(cap, Math.round(rawScore)));
}

export function buildTrustExplanation() {
  return "Los logros son principalmente cosmeticos. La Credibilidad ARGUS se calcula con evidencia, reportes confirmados, validacion independiente y sanciones. No determina por si solo la prioridad de emergencia.";
}
