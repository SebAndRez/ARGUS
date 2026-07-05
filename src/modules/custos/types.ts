import type { ArgusRole } from "@/types/rbac";

export type CustosAccessLevel = "none" | "restricted_view" | "case_search" | "operational_search" | "supervised_admin" | "superadmin";
export type CustosOperationalReasonType = "missing_person" | "emergency_response" | "family_reunification" | "evacuation_support" | "lawful_police_operation" | "court_or_authority_request" | "humanitarian_status_check" | "other_authorized_reason";
export type CustosSearchType = "identity" | "alias" | "case_id" | "emergency_contact" | "safe_status" | "shelter_registry" | "medical_transfer_status" | "zone_presence_aggregate";
export type CustosHumanitarianStatus = "unknown" | "reported_safe" | "needs_help" | "in_shelter" | "medical_attention" | "evacuated" | "missing_reported" | "not_found" | "restricted";
export type CustosResultVisibility = "minimal" | "protected" | "operational" | "sensitive" | "redacted";
export type CustosAction = "view_minimal_status" | "request_more_detail" | "link_to_case" | "mark_as_safe" | "mark_as_needs_help" | "send_to_atlas" | "request_human_review" | "export_audit_summary";

export type CustosOperationalReason = {
  id: string;
  type: CustosOperationalReasonType;
  caseId?: string;
  operationId?: string;
  authorityReference?: string;
  description: string;
  requestedByUserId: string;
  requestedByRole: string;
  createdAt: string;
  expiresAt?: string;
  approvedByUserId?: string;
  status: "draft" | "submitted" | "approved" | "rejected" | "expired";
};

export type CustosValidationResult = { valid: boolean; errors: string[]; warnings: string[] };

export type CustosPersonSearchResult = {
  id: string;
  displayName: string;
  alias?: string;
  approximateAgeRange?: string;
  identityHash?: string;
  status: CustosHumanitarianStatus;
  lastKnownContext?: {
    type: "self_check_in" | "shelter_check_in" | "medical_transfer" | "vigia_report" | "atlas_event" | "unknown";
    label: string;
    timestamp?: string;
    locationLabel?: string;
    locationApproximate?: boolean;
  };
  visibility: CustosResultVisibility;
  allowedActions: CustosAction[];
  confidence: "unknown" | "low" | "medium" | "high" | "verified";
  warnings: string[];
  auditRequired: boolean;
};

export type CustosSearchInput = {
  searchType: CustosSearchType;
  query: string;
  operationalReason: CustosOperationalReason;
  userRole: string;
  userId: string;
};

export type CustosSearchResponse = {
  searchId: string;
  results: CustosPersonSearchResult[];
  redacted: boolean;
  requiresApproval: boolean;
  warnings: string[];
  auditId?: string;
  createdAt: string;
};

export type CustosFeature =
  | "view_module"
  | "submit_operational_reason"
  | "perform_search"
  | "view_minimal_result"
  | "view_protected_result"
  | "request_sensitive_detail"
  | "view_audit_trail"
  | "link_result_to_case"
  | "mark_humanitarian_status"
  | "send_to_atlas"
  | "export_audit_summary"
  | "admin_review";

export type CustosRiskFlag = {
  id: string;
  severity: "low" | "medium" | "high" | "critical";
  type: "high_volume_search" | "missing_case_reference" | "repeated_subject_search" | "out_of_scope_query" | "sensitive_detail_pattern" | "possible_personal_use" | "unknown";
  message: string;
  recommendedAction: string;
};

export type CustosRoleContext = { id?: string; role: ArgusRole };
