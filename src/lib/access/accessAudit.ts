type AccessAuditPayload = {
  subjectId?: string | null;
  action: string;
  surface?: string;
  decision?: string;
  reason?: string;
};

function shouldLogAccessAudit() {
  return process.env.NODE_ENV !== "production";
}

export function logAccessDecision(payload: AccessAuditPayload) {
  if (!shouldLogAccessAudit()) return;
  console.info("[ARGUS access audit]", sanitizeAuditPayload(payload));
}

export function logInstitutionalAccessAttempt(payload: AccessAuditPayload) {
  logAccessDecision({ ...payload, action: payload.action || "INSTITUTIONAL_ACCESS_ATTEMPT" });
}

export function logApiAccessAttempt(payload: AccessAuditPayload) {
  logAccessDecision({ ...payload, action: payload.action || "API_ACCESS_ATTEMPT" });
}

export function logDeniedAccess(payload: AccessAuditPayload) {
  logAccessDecision({ ...payload, decision: "DENY" });
}

function sanitizeAuditPayload(payload: AccessAuditPayload) {
  return {
    subjectId: payload.subjectId ? `${payload.subjectId.slice(0, 6)}...` : null,
    action: payload.action,
    surface: payload.surface,
    decision: payload.decision,
    reason: payload.reason,
  };
}
