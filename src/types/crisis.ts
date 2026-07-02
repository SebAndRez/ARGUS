export type EventSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type EventType = "REPORT" | "SOS" | "ALERT";
export type EventStatus = "NEW" | "UNDER_REVIEW" | "VALIDATED" | "DISCARDED" | "ESCALATED" | "RESOLVED";
export type HelpPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type HelpStatus = "RECEIVED" | "UNDER_REVIEW" | "ASSIGNED" | "RESOLVED" | "CANCELLED";
export type UserRole = "CITIZEN" | "RESPONDER" | "OPERATOR" | "ANALYST" | "ADMIN";
export type AccountStatus = "ACTIVE" | "WATCHED" | "LIMITED" | "SUSPENDED" | "BANNED";
export type AlertLifecycleStatus =
  | "new"
  | "verifying"
  | "confirmed"
  | "responding"
  | "resolved"
  | "expired"
  | "dismissed";
export type AlertVerificationAction =
  | "still_happening"
  | "not_happening"
  | "cannot_verify"
  | "false_report"
  | "reactivate";

export interface CrisisEvent {
  id: string;
  title: string;
  category: string;
  description: string;
  latitude: number;
  longitude: number;
  locationText?: string | null;
  severity: EventSeverity;
  priority?: HelpPriority | null;
  type: EventType;
  status: string;
  createdAt: string;
  updatedAt?: string;
  aiRecommendation?: string | null;
  aiSummary?: string | null;
  aiConfidence?: number | null;
  confidence?: number | null;
  confidenceLabel?: string | null;
  sourceCategory?: string | null;
  sourceSummary?: string | null;
  lastUpdatedLabel?: string | null;
  whyItMatters?: string | null;
  recommendedAction?: string | null;
  operatorRecommendedAction?: string | null;
  falseReportRisk?: number | null;
  lifecycleStatus?: AlertLifecycleStatus | null;
  verificationCount?: number | null;
  stillHappeningCount?: number | null;
  notHappeningCount?: number | null;
  falseReportCount?: number | null;
  lastVerifiedAt?: string | null;
  expiresAt?: string | null;
  isExpired?: boolean | null;
  canReactivate?: boolean | null;
  priorityScore?: number | null;
  restrictedMode?: boolean;
  isDemo?: boolean;
  author?: string;
  recordType?: "Report" | "HelpRequest";
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  emailVerificationState?: "verified" | "pending_verification" | "missing" | "change_pending";
  emailVerified?: boolean;
  governmentIdPresent?: boolean;
  countryCode?: string | null;
  termsAccepted?: boolean;
  privacyAccepted?: boolean;
  profileCompletedAt?: string | null;
  profileCompletionRequired?: boolean;
  publicAlias: string;
  role: UserRole;
  accountStatus: AccountStatus;
  trustScore: number;
  strikes: number;
}

export type UserLocationStatus = "idle" | "loading" | "granted" | "denied" | "error" | "fallback";

export interface UserLocationState {
  status: UserLocationStatus;
  latitude: number;
  longitude: number;
  accuracy: number;
  errorMessage: string;
}
