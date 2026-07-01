export type AchievementCategory =
  | "REPORTING"
  | "VERIFICATION"
  | "SAFETY"
  | "MEDICAL"
  | "SEISMIC"
  | "WEATHER"
  | "MAPPING"
  | "COMMUNITY"
  | "ACCOUNT"
  | "COMMAND";

export type AchievementRarity =
  | "COMMON"
  | "UNCOMMON"
  | "RARE"
  | "EPIC"
  | "LEGENDARY";

export type AchievementProgressSource =
  | "CONFIRMED_REPORT"
  | "INDEPENDENT_CONFIRMATION"
  | "OFFICIAL_CORRELATION"
  | "CITIZEN_VERIFICATION"
  | "SENSOR_CONFIRMATION"
  | "MAP_VALIDATION"
  | "MEDICAL_PROFILE_COMPLETED"
  | "EMERGENCY_CONTACT_ADDED"
  | "CLEAN_HISTORY"
  | "FALSE_REPORT_PENALTY"
  | "DUPLICATE_REPORT_PENALTY";

export type TrustSignalType = "POSITIVE" | "NEGATIVE" | "NEUTRAL";

export type TrustEventType =
  | "REPORT_CREATED"
  | "REPORT_CONFIRMED"
  | "REPORT_REJECTED"
  | "REPORT_DUPLICATED"
  | "REPORT_FALSE"
  | "REPORT_OFFICIAL_CORRELATED"
  | "REPORT_CONFIRMED_BY_USERS"
  | "VERIFICATION_ACCEPTED"
  | "VERIFICATION_REJECTED"
  | "MEDICAL_PROFILE_COMPLETED"
  | "EMERGENCY_CONTACT_ADDED"
  | "QUAKESENSE_VALID_SIGNAL"
  | "MAP_POINT_VALIDATED"
  | "SANCTION_APPLIED"
  | "STRIKE_REMOVED";

export type TrustBand =
  | "NEW"
  | "LOW"
  | "NORMAL"
  | "TRUSTED"
  | "HIGH_TRUST"
  | "WATCHLIST"
  | "LIMITED";

export type AchievementDefinition = {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  rarity: AchievementRarity;
  maxLevel: 10;
  levelThresholds: number[];
  cosmeticOnly: boolean;
  contributesToTrust: boolean;
  trustWeightCap: number;
  icon: string;
  color: string;
};

export type UserAchievement = {
  id: string;
  userId: string;
  achievementId: string;
  level: number;
  progress: number;
  nextLevelProgress: number | null;
  unlockedAt?: string;
  updatedAt: string;
  isDemo?: boolean;
};

export type TrustEvent = {
  id: string;
  userId: string;
  type: TrustEventType;
  signal: TrustSignalType;
  weight: number;
  sourceType?: string;
  sourceId?: string;
  reason?: string;
  createdAt: string;
};

export type UserTrustSummary = {
  userId: string;
  publicAlias: string;
  trustScore: number;
  trustBand: TrustBand;
  verifiedIdentity: boolean;
  confirmedReports: number;
  rejectedReports: number;
  falseReports: number;
  duplicateReports: number;
  independentConfirmations: number;
  officialCorrelations: number;
  achievementsUnlocked: number;
  highestAchievementLevel: number;
  lastUpdatedAt: string;
  isDemo?: boolean;
};

export type UserTrustStats = {
  userId: string;
  publicAlias: string;
  baseTrustScore: number;
  accountStatus: string;
  strikes: number;
  verifiedIdentity: boolean;
  reportsCreated: number;
  confirmedReports: number;
  rejectedReports: number;
  falseReports: number;
  duplicateReports: number;
  independentConfirmations: number;
  officialCorrelations: number;
  acceptedVerifications: number;
  mapValidations: number;
  medicalProfileCompleted: boolean;
  emergencyContactAdded: boolean;
  quakesenseValidSignals: number;
  cleanHistoryUnits: number;
};

export type TrustAchievementProfile = {
  summary: UserTrustSummary;
  achievements: UserAchievement[];
  definitions: AchievementDefinition[];
  nextMilestones: Array<{
    achievementId: string;
    name: string;
    level: number;
    remaining: number;
  }>;
  explanation: string;
};
