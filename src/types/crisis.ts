export type EventSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type EventType = "REPORT" | "SOS" | "ALERT";
export type EventStatus = "NEW" | "UNDER_REVIEW" | "VALIDATED" | "DISCARDED" | "ESCALATED" | "RESOLVED";
export type HelpPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type HelpStatus = "RECEIVED" | "UNDER_REVIEW" | "ASSIGNED" | "RESOLVED" | "CANCELLED";
export type UserRole = "CITIZEN" | "RESPONDER" | "OPERATOR" | "ANALYST" | "ADMIN";
export type AccountStatus = "ACTIVE" | "WATCHED" | "LIMITED" | "SUSPENDED" | "BANNED";

export interface CrisisEvent {
  id: string;
  title: string;
  category: string;
  description: string;
  latitude: number;
  longitude: number;
  locationText?: string | null;
  severity: EventSeverity;
  type: EventType;
  status: string;
  createdAt: string;
  updatedAt?: string;
  aiRecommendation?: string | null;
  aiSummary?: string | null;
  aiConfidence?: number | null;
  falseReportRisk?: number | null;
  restrictedMode?: boolean;
  author?: string;
  recordType?: "Report" | "HelpRequest";
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
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
