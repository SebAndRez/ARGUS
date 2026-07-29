import { describe, expect, it } from "vitest";
import {
  RLS_AUTO_ENABLE_GUARD_CONSTANTS,
  evaluateRlsAutoEnableRemediation,
} from "../../scripts/database-target/lib/rlsAutoEnableGuard.mjs";

const validEvidence = () => ({
  functionBodyCaptured: true,
  grantsReviewed: true,
  remediationDecision: "REVOKE",
  remediationApprovedBy: "security-lead@example.com",
  remediationApprovedAt: "2026-07-20T00:00:00Z",
});

describe("evaluateRlsAutoEnableRemediation", () => {
  it("fails closed with no evidence at all", () => {
    const result = evaluateRlsAutoEnableRemediation(undefined);
    expect(result.ready).toBe(false);
  });

  it("passes with complete, correctly-shaped evidence", () => {
    expect(evaluateRlsAutoEnableRemediation(validEvidence())).toEqual({ ready: true, blockingReasons: [] });
  });

  it("rejects when functionBodyCaptured is not true", () => {
    const result = evaluateRlsAutoEnableRemediation({ ...validEvidence(), functionBodyCaptured: false });
    expect(result.ready).toBe(false);
  });

  it("rejects when grantsReviewed is not true", () => {
    const result = evaluateRlsAutoEnableRemediation({ ...validEvidence(), grantsReviewed: false });
    expect(result.ready).toBe(false);
  });

  it("rejects an unknown remediationDecision", () => {
    const result = evaluateRlsAutoEnableRemediation({ ...validEvidence(), remediationDecision: "IGNORE" });
    expect(result.ready).toBe(false);
  });

  it.each([...RLS_AUTO_ENABLE_GUARD_CONSTANTS.ALLOWED_REMEDIATION_DECISIONS])(
    "accepts remediationDecision=%s",
    (decision) => {
      const result = evaluateRlsAutoEnableRemediation({ ...validEvidence(), remediationDecision: decision });
      expect(result.ready).toBe(true);
    }
  );

  it("rejects a missing remediationApprovedBy", () => {
    const evidence = validEvidence() as Record<string, unknown>;
    delete evidence.remediationApprovedBy;
    expect(evaluateRlsAutoEnableRemediation(evidence).ready).toBe(false);
  });

  it("rejects an invalid remediationApprovedAt", () => {
    const result = evaluateRlsAutoEnableRemediation({ ...validEvidence(), remediationApprovedAt: "not-a-date" });
    expect(result.ready).toBe(false);
  });
});
