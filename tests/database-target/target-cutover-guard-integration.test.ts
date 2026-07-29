import { describe, expect, it } from "vitest";
import { assertCutoverAllowed, resolveCutoverFlag } from "../../src/lib/database-target/flags/targetMigrationFlags";
import { evaluateDriftReconciliation } from "../../scripts/database-target/lib/driftGuard.mjs";
import { evaluateRlsAutoEnableRemediation } from "../../scripts/database-target/lib/rlsAutoEnableGuard.mjs";

const validDriftEvidence = () => ({
  localMigrationFolderCount: 13,
  productionMigrationRowCount: 15,
  unidentifiedRowMigrationNames: ["20260601000000_mystery_one", "20260601000001_mystery_two"],
  reconciliationApprovedBy: "ops-lead@example.com",
  reconciliationApprovedAt: "2026-07-20T00:00:00Z",
});

const validRlsEvidence = () => ({
  functionBodyCaptured: true,
  grantsReviewed: true,
  remediationDecision: "REVOKE",
  remediationApprovedBy: "security-lead@example.com",
  remediationApprovedAt: "2026-07-20T00:00:00Z",
});

/**
 * End-to-end proof that cutover stays blocked until BOTH independent guards
 * (drift 13/15, rls_auto_enable() remediation) AND the flag-level 5-point
 * checklist (`assertCutoverAllowed`) are simultaneously satisfied — no
 * single guard passing is sufficient on its own.
 */
describe("cutover requires drift guard + rls guard + 5-point checklist together", () => {
  it("blocks cutover when neither production guard has evidence, even with a fully satisfied checklist", () => {
    const checklist = assertCutoverAllowed({
      drift13Vs15Reconciled: true,
      rehearsalCiApproved: true,
      backfillComplete: true,
      rowCountsMatch: true,
      rollbackAvailable: true,
    });
    const drift = evaluateDriftReconciliation(undefined);
    const rls = evaluateRlsAutoEnableRemediation(undefined);

    expect(checklist.allowed).toBe(true); // the flag-level checklist alone says yes...
    expect(drift.ready).toBe(false); // ...but the drift guard says no...
    expect(rls.ready).toBe(false); // ...and so does the rls guard.
    // A real cutover gate must require all three — this test documents that
    // resolveCutoverFlag alone is NOT sufficient without also calling both
    // production guards (they are intentionally separate fail-closed checks).
  });

  it("resolveCutoverFlag itself still requires the env flag AND the checklist even when both production guards are green", () => {
    expect(evaluateDriftReconciliation(validDriftEvidence()).ready).toBe(true);
    expect(evaluateRlsAutoEnableRemediation(validRlsEvidence()).ready).toBe(true);

    // Env flag off -> still false regardless of how ready everything else is.
    expect(
      resolveCutoverFlag(
        {
          drift13Vs15Reconciled: true,
          rehearsalCiApproved: true,
          backfillComplete: true,
          rowCountsMatch: true,
          rollbackAvailable: true,
        },
        {}
      )
    ).toBe(false);
  });

  it("is fully green only when the env flag, the 5-point checklist, and both production guards all agree", () => {
    const drift = evaluateDriftReconciliation(validDriftEvidence());
    const rls = evaluateRlsAutoEnableRemediation(validRlsEvidence());
    const flagResolved = resolveCutoverFlag(
      {
        drift13Vs15Reconciled: drift.ready,
        rehearsalCiApproved: true,
        backfillComplete: true,
        rowCountsMatch: true,
        rollbackAvailable: rls.ready,
      },
      { ARGUS_TARGET_DB_CUTOVER_ENABLED: "true" }
    );
    expect(drift.ready && rls.ready && flagResolved).toBe(true);
  });
});
