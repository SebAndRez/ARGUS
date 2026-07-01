import type { UserTrustStats } from "@/types/trustAchievements";

export const demoTrustStats: UserTrustStats = {
  userId: "demo-trust-user",
  publicAlias: "Ciudadano Demo",
  baseTrustScore: 70,
  accountStatus: "ACTIVE",
  strikes: 0,
  verifiedIdentity: true,
  reportsCreated: 12,
  confirmedReports: 5,
  rejectedReports: 1,
  falseReports: 0,
  duplicateReports: 1,
  independentConfirmations: 4,
  officialCorrelations: 2,
  acceptedVerifications: 3,
  mapValidations: 2,
  medicalProfileCompleted: false,
  emergencyContactAdded: true,
  quakesenseValidSignals: 1,
  cleanHistoryUnits: 10,
};
