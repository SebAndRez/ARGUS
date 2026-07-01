import { demoTrustStats } from "@/data/demoTrustProfiles";
import { prisma } from "@/lib/prisma";
import { buildAchievementSummary } from "@/lib/trust/achievementEngine";
import type { UserTrustStats } from "@/types/trustAchievements";

const confirmedStatuses = ["VALIDATED", "VERIFIED", "CONFIRMED", "RESOLVED"];
const rejectedStatuses = ["DISCARDED", "REJECTED"];

export async function buildTrustStatsForUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      publicAlias: true,
      trustScore: true,
      strikes: true,
      accountStatus: true,
      governmentIdHash: true,
      emailVerifiedAt: true,
      reports: {
        select: {
          status: true,
          category: true,
          falseReportRisk: true,
        },
      },
      auditLogs: {
        select: {
          action: true,
        },
      },
      sanctions: {
        select: {
          type: true,
        },
      },
    },
  });

  if (!user) return null;

  const confirmedReports = user.reports.filter((report) =>
    confirmedStatuses.includes(report.status)
  ).length;
  const rejectedReports = user.reports.filter((report) =>
    rejectedStatuses.includes(report.status)
  ).length;
  const falseReports = user.reports.filter(
    (report) => (report.falseReportRisk ?? 0) >= 80
  ).length;
  const officialCorrelations = user.auditLogs.filter((log) =>
    log.action.includes("OFFICIAL")
  ).length;
  const acceptedVerifications = user.auditLogs.filter((log) =>
    ["REPORT_VALIDATED", "VERIFICATION_ACCEPTED"].includes(log.action)
  ).length;

  return {
    userId: user.id,
    publicAlias: user.publicAlias,
    baseTrustScore: user.trustScore,
    accountStatus: user.accountStatus,
    strikes: user.strikes,
    verifiedIdentity: Boolean(user.governmentIdHash || user.emailVerifiedAt),
    reportsCreated: user.reports.length,
    confirmedReports,
    rejectedReports,
    falseReports,
    duplicateReports: 0,
    independentConfirmations: acceptedVerifications,
    officialCorrelations,
    acceptedVerifications,
    mapValidations: 0,
    medicalProfileCompleted: false,
    emergencyContactAdded: false,
    quakesenseValidSignals: 0,
    cleanHistoryUnits:
      user.strikes === 0 && user.sanctions.length === 0
        ? Math.max(1, user.reports.length)
        : 0,
  } satisfies UserTrustStats;
}

export async function buildTrustProfileForUser(userId?: string | null) {
  const stats = userId ? await buildTrustStatsForUser(userId) : null;
  return buildAchievementSummary(stats ?? demoTrustStats);
}

export function sanitizePublicTrustProfile(
  profile: Awaited<ReturnType<typeof buildTrustProfileForUser>>
) {
  return {
    summary: {
      userId: profile.summary.userId,
      publicAlias: profile.summary.publicAlias,
      trustBand: profile.summary.trustBand,
      trustScore: Math.round(profile.summary.trustScore / 5) * 5,
      verifiedIdentity: profile.summary.verifiedIdentity,
      confirmedReports: profile.summary.confirmedReports,
      achievementsUnlocked: profile.summary.achievementsUnlocked,
      highestAchievementLevel: profile.summary.highestAchievementLevel,
      isDemo: profile.summary.isDemo,
    },
    achievements: profile.achievements.filter((achievement) => achievement.level > 0),
    definitions: profile.definitions,
    explanation: profile.explanation,
  };
}
