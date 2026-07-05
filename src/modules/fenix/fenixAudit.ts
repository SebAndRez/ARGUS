export function auditFenixAction(payload: { userId?: string; userRole: string; action: "module_view" | "scenario_created" | "scenario_run" | "scenario_compared" | "scenario_exported" | "action_plan_generated" | "send_to_atlas" | "sensitive_context_viewed"; scenarioId?: string; baseEventId?: string; reason?: string; timestamp?: string }) {
  const entry = { ...payload, timestamp: payload.timestamp ?? new Date().toISOString() };
  if (process.env.NODE_ENV !== "production") console.info("[ARGUS FENIX audit]", entry);
  return entry;
}
