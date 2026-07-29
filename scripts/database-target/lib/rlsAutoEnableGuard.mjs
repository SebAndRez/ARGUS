// scripts/database-target/lib/rlsAutoEnableGuard.mjs
//
// Core, importable logic for the `public.rls_auto_enable()` cutover guard
// (Executable Migration Plan Fase 12; drift documented in
// ARGUS_RLS_AUTO_ENABLE_REMEDIATION_v1.0.md). That function is a
// SECURITY DEFINER plpgsql function found by drift, reachable by both
// `anon` and `authenticated` via PostgREST, whose body/search_path/owner
// were never captured (execute_sql was declined for that session) and
// whose grants have not yet been remediated.
//
// This module NEVER executes the function and NEVER connects to
// production. It only validates a future, explicitly-supplied evidence
// file proving a human captured the function definition, reviewed the
// anon/authenticated grants, and approved a remediation decision. Absent
// that file, or with an incomplete one, it fails CLOSED.

const ALLOWED_REMEDIATION_DECISIONS = new Set(["REVOKE", "KEEP_RESTRICTED", "REMOVE"]);

/**
 * @typedef {object} RlsAutoEnableRemediationEvidence
 * @property {boolean} functionBodyCaptured - pg_get_functiondef captured and reviewed.
 * @property {boolean} grantsReviewed - anon/authenticated EXECUTE grants reviewed in the Supabase dashboard.
 * @property {"REVOKE"|"KEEP_RESTRICTED"|"REMOVE"} remediationDecision
 * @property {string} remediationApprovedBy
 * @property {string} remediationApprovedAt - ISO 8601 timestamp
 */

/**
 * @typedef {object} RlsGuardResult
 * @property {boolean} ready
 * @property {string[]} blockingReasons
 */

/**
 * @param {unknown} evidence
 * @returns {RlsGuardResult}
 */
export function evaluateRlsAutoEnableRemediation(evidence) {
  const blockingReasons = [];

  if (!evidence || typeof evidence !== "object") {
    return {
      ready: false,
      blockingReasons: [
        "no rls_auto_enable() remediation evidence supplied — failing closed (function definition/grants not captured)",
      ],
    };
  }

  const e = /** @type {Partial<RlsAutoEnableRemediationEvidence>} */ (evidence);

  if (e.functionBodyCaptured !== true) {
    blockingReasons.push(
      "functionBodyCaptured must be true — pg_get_functiondef()/search_path/owner must be captured before cutover"
    );
  }
  if (e.grantsReviewed !== true) {
    blockingReasons.push(
      "grantsReviewed must be true — anon/authenticated EXECUTE grants on public.rls_auto_enable() must be reviewed"
    );
  }
  if (!e.remediationDecision || !ALLOWED_REMEDIATION_DECISIONS.has(e.remediationDecision)) {
    blockingReasons.push(
      `remediationDecision must be one of ${[...ALLOWED_REMEDIATION_DECISIONS].join("/")} (got ${JSON.stringify(e.remediationDecision ?? null)})`
    );
  }
  if (!e.remediationApprovedBy || typeof e.remediationApprovedBy !== "string") {
    blockingReasons.push("remediationApprovedBy is required — an unattributed remediation is not accepted");
  }
  if (!e.remediationApprovedAt || Number.isNaN(Date.parse(e.remediationApprovedAt))) {
    blockingReasons.push("remediationApprovedAt must be a valid ISO 8601 timestamp");
  }

  return { ready: blockingReasons.length === 0, blockingReasons };
}

export const RLS_AUTO_ENABLE_GUARD_CONSTANTS = { ALLOWED_REMEDIATION_DECISIONS };
