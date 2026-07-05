export type AuraAuditAction =
  | "module_view"
  | "profile_updated"
  | "medical_data_shared"
  | "medical_emergency_created"
  | "triage_case_created"
  | "triage_case_updated"
  | "medical_transport_requested"
  | "medical_capacity_updated"
  | "medical_stock_updated"
  | "send_to_nexus"
  | "send_to_hermes"
  | "send_to_atlas"
  | "sensitive_medical_data_viewed"
  | "medical_export";

export function auditAuraAction(payload: {
  userId?: string;
  userRole: string;
  action: AuraAuditAction;
  profileUserId?: string;
  caseId?: string;
  medicalPointId?: string;
  stockItemId?: string;
  reason?: string;
  timestamp?: string;
}) {
  const entry = { ...payload, timestamp: payload.timestamp ?? new Date().toISOString() };
  if (process.env.NODE_ENV !== "production") console.info("[ARGUS AURA audit]", entry);
  return entry;
}
