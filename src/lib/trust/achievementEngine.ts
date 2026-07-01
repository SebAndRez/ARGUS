import { achievementDefinitions } from "@/data/achievementDefinitions";
import { demoTrustStats } from "@/data/demoTrustProfiles";
import {
  buildTrustExplanation,
  calculateTrustScore,
  getTrustBand,
} from "@/lib/trust/trustScoreEngine";
import type {
  AchievementDefinition,
  TrustAchievementProfile,
  UserAchievement,
  UserTrustStats,
  UserTrustSummary,
} from "@/types/trustAchievements";

export function calculateAchievementLevel(
  definition: AchievementDefinition,
  progress: number
) {
  let level = 0;
  for (const threshold of definition.levelThresholds) {
    if (progress >= threshold) level += 1;
  }
  return Math.min(definition.maxLevel, level);
}

export function getAchievementProgress(
  definition: AchievementDefinition,
  stats: UserTrustStats
) {
  switch (definition.id) {
    case "confirmed-reporter":
      return stats.confirmedReports;
    case "local-verifier":
      return stats.acceptedVerifications;
    case "reliable-source":
      return stats.confirmedReports > 0 && stats.falseReports === 0
        ? Math.round(stats.confirmedReports * 0.75)
        : 0;
    case "seismic-observer":
      return stats.quakesenseValidSignals;
    case "weather-observer":
      return Math.max(0, Math.floor(stats.confirmedReports / 3));
    case "argus-cartographer":
      return stats.mapValidations;
    case "basic-medical-support":
      return Number(stats.medicalProfileCompleted) + Number(stats.emergencyContactAdded);
    case "clean-history":
      return stats.falseReports === 0 && stats.strikes === 0 ? stats.cleanHistoryUnits : 0;
    case "useful-community-alert":
      return stats.officialCorrelations;
    case "crisis-collaborator":
      return Math.min(stats.independentConfirmations, stats.confirmedReports);
    default:
      return 0;
  }
}

export function evaluateUnlockedAchievements(stats: UserTrustStats) {
  return achievementDefinitions.map((definition) => {
    const progress = getAchievementProgress(definition, stats);
    const level = calculateAchievementLevel(definition, progress);
    const nextLevelProgress =
      definition.levelThresholds[level] === undefined
        ? null
        : definition.levelThresholds[level];
    return {
      id: `${stats.userId}-${definition.id}`,
      userId: stats.userId,
      achievementId: definition.id,
      level,
      progress,
      nextLevelProgress,
      unlockedAt: level > 0 ? new Date().toISOString() : undefined,
      updatedAt: new Date().toISOString(),
      isDemo: stats.userId === demoTrustStats.userId,
    } satisfies UserAchievement;
  });
}

export function calculateAchievementTrustContribution(
  achievements: UserAchievement[]
) {
  return achievements.reduce((sum, achievement) => {
    const definition = achievementDefinitions.find(
      (item) => item.id === achievement.achievementId
    );
    if (!definition?.contributesToTrust || definition.cosmeticOnly) return sum;
    return sum + Math.min(definition.trustWeightCap, achievement.level);
  }, 0);
}

export function buildTrustSummary(
  stats: UserTrustStats,
  achievements: UserAchievement[]
): UserTrustSummary {
  const score = calculateTrustScore(
    stats,
    calculateAchievementTrustContribution(achievements)
  );
  return {
    userId: stats.userId,
    publicAlias: stats.publicAlias,
    trustScore: score,
    trustBand: getTrustBand(score, stats),
    verifiedIdentity: stats.verifiedIdentity,
    confirmedReports: stats.confirmedReports,
    rejectedReports: stats.rejectedReports,
    falseReports: stats.falseReports,
    duplicateReports: stats.duplicateReports,
    independentConfirmations: stats.independentConfirmations,
    officialCorrelations: stats.officialCorrelations,
    achievementsUnlocked: achievements.filter((item) => item.level > 0).length,
    highestAchievementLevel: Math.max(0, ...achievements.map((item) => item.level)),
    lastUpdatedAt: new Date().toISOString(),
    isDemo: stats.userId === demoTrustStats.userId,
  };
}

export function getNextAchievementMilestones(achievements: UserAchievement[]) {
  return achievements
    .map((achievement) => {
      const definition = achievementDefinitions.find(
        (item) => item.id === achievement.achievementId
      );
      if (!definition || achievement.nextLevelProgress === null) return null;
      return {
        achievementId: definition.id,
        name: definition.name,
        level: achievement.level + 1,
        remaining: Math.max(0, achievement.nextLevelProgress - achievement.progress),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 3);
}

export function buildAchievementSummary(
  stats: UserTrustStats = demoTrustStats
): TrustAchievementProfile {
  const achievements = evaluateUnlockedAchievements(stats);
  const summary = buildTrustSummary(stats, achievements);
  return {
    summary,
    achievements,
    definitions: achievementDefinitions,
    nextMilestones: getNextAchievementMilestones(achievements),
    explanation: buildTrustExplanation(),
  };
}

export async function calculateAchievementProgress(userId: string) {
  return buildAchievementSummary({ ...demoTrustStats, userId });
}

export async function updateUserAchievements(userId: string) {
  return calculateAchievementProgress(userId);
}

export async function getNextAchievementMilestonesForUser(userId: string) {
  const profile = await calculateAchievementProgress(userId);
  return profile.nextMilestones;
}
