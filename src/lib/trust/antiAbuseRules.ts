import type { UserTrustStats } from "@/types/trustAchievements";

export const trustAntiAbusePrinciples = [
  "La cantidad bruta de reportes no sube credibilidad por si sola.",
  "SOS, Missing Persons y reportes medicos no se gamifican por volumen.",
  "Reportes duplicados no suman logros ni credibilidad.",
  "Reportes falsos o sanciones reducen credibilidad incluso si hay medallas.",
  "Confirmaciones de cuentas nuevas o relacionadas pesan menos.",
  "Los logros no pueden elevar trust por encima de un limite si el historial es malo.",
  "La prioridad de emergencia nunca depende solo de medallas.",
];

export function calculateAntiAbuseCap(stats: UserTrustStats) {
  if (["BANNED", "SUSPENDED", "LIMITED"].includes(stats.accountStatus)) {
    return 45;
  }
  if (stats.falseReports > 0 || stats.strikes >= 2) return 60;
  if (stats.rejectedReports > stats.confirmedReports && stats.reportsCreated >= 3) {
    return 65;
  }
  if (!stats.verifiedIdentity && stats.reportsCreated < 5) return 75;
  return 100;
}

export function calculateReportQualityRatio(stats: UserTrustStats) {
  const reviewed =
    stats.confirmedReports +
    stats.rejectedReports +
    stats.falseReports +
    stats.duplicateReports;
  if (reviewed === 0) return 0.5;
  return Math.max(
    0,
    Math.min(1, stats.confirmedReports / Math.max(1, reviewed))
  );
}

export function shouldAwardVolumeAchievement(
  stats: UserTrustStats,
  category: "SOS" | "MISSING_PERSON" | "MEDICAL" | "NORMAL_REPORT"
) {
  if (category !== "NORMAL_REPORT") return false;
  return stats.confirmedReports > 0 && stats.falseReports === 0;
}
