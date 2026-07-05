import type { CustosRiskFlag } from "@/modules/custos/types";

export function auditCustosAction(payload: {
  userId?: string;
  userRole: string;
  action:
    | "module_opened"
    | "legal_warning_accepted"
    | "operational_reason_created"
    | "operational_reason_rejected"
    | "search_executed"
    | "result_viewed"
    | "protected_detail_requested"
    | "sensitive_detail_viewed"
    | "humanitarian_status_updated"
    | "result_linked_to_case"
    | "send_to_atlas"
    | "export_generated"
    | "access_denied"
    | "suspicious_use_detected";
  operationalReasonId?: string;
  searchId?: string;
  subjectHash?: string;
  caseId?: string;
  operationId?: string;
  resultCount?: number;
  redacted?: boolean;
  riskFlags?: CustosRiskFlag[];
  timestamp?: string;
}) {
  const entry = { ...payload, timestamp: payload.timestamp ?? new Date().toISOString() };
  if (process.env.NODE_ENV !== "production") console.info("[ARGUS CUSTOS audit]", entry);
  return entry;
}
