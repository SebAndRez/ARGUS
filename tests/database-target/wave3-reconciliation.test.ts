import { describe, expect, it } from "vitest";
import { buildReconciliationOutcome } from "../../src/lib/database-target/shadow-write/reconciliationOutcome";

describe("buildReconciliationOutcome — the 9-code vocabulary Fase 10 requires", () => {
  const codes = [
    "MATCH",
    "CREATED",
    "ALREADY_EXISTS",
    "EXPECTED_DIFFERENCE",
    "MIGRATION_GAP",
    "TARGET_MISSING",
    "LEGACY_MISSING",
    "REQUIRES_REVIEW",
    "TARGET_WRITE_FAILED",
  ] as const;

  it.each(codes)("constructs a valid outcome for code=%s", (code) => {
    const outcome = buildReconciliationOutcome({
      code,
      domain: "TestDomain",
      legacyId: "legacy_1",
      idempotencyKey: "key_1",
      correlationId: "corr_1",
    });
    expect(outcome.code).toBe(code);
    expect(outcome.domain).toBe("TestDomain");
    expect(outcome.legacyId).toBe("legacy_1");
    expect(outcome.idempotencyKey).toBe("key_1");
    expect(outcome.correlationId).toBe("corr_1");
    expect(typeof outcome.timestamp).toBe("string");
  });

  it("marks MIGRATION_GAP/REQUIRES_REVIEW/TARGET_WRITE_FAILED as retryable, everything else as not", () => {
    const retryableCodes = new Set(["MIGRATION_GAP", "REQUIRES_REVIEW", "TARGET_WRITE_FAILED"]);
    for (const code of codes) {
      const outcome = buildReconciliationOutcome({ code, domain: "d", legacyId: "l", idempotencyKey: "k", correlationId: "c" });
      expect(outcome.retryable).toBe(retryableCodes.has(code));
    }
  });

  it("includes the full required field set: domain, legacyId, targetId, idempotencyKey, retryable, migrationConfidence, reviewStatus, errorCode, timestamp, correlationId", () => {
    const outcome = buildReconciliationOutcome({
      code: "CREATED",
      domain: "ExternalEvent",
      legacyId: "ee_1",
      targetId: "sr_1",
      idempotencyKey: "key_1",
      migrationConfidence: "HIGH",
      reviewStatus: "AUTO_MAPPED",
      errorCode: null,
      correlationId: "corr_1",
    });
    expect(outcome).toEqual({
      code: "CREATED",
      domain: "ExternalEvent",
      legacyId: "ee_1",
      targetId: "sr_1",
      idempotencyKey: "key_1",
      retryable: false,
      migrationConfidence: "HIGH",
      reviewStatus: "AUTO_MAPPED",
      errorCode: null,
      timestamp: outcome.timestamp,
      correlationId: "corr_1",
    });
  });

  it("defaults targetId/migrationConfidence/reviewStatus/errorCode to null when omitted — never fabricates a value", () => {
    const outcome = buildReconciliationOutcome({
      code: "TARGET_MISSING",
      domain: "d",
      legacyId: "l",
      idempotencyKey: "k",
      correlationId: "c",
    });
    expect(outcome.targetId).toBeNull();
    expect(outcome.migrationConfidence).toBeNull();
    expect(outcome.reviewStatus).toBeNull();
    expect(outcome.errorCode).toBeNull();
  });

  it("never includes content/name/email/coordinate/evidence/medical fields — only the documented schema", () => {
    const outcome = buildReconciliationOutcome({
      code: "CREATED",
      domain: "Report",
      legacyId: "report_1",
      idempotencyKey: "key_1",
      correlationId: "corr_1",
    });
    const allowedKeys = new Set([
      "code",
      "domain",
      "legacyId",
      "targetId",
      "idempotencyKey",
      "retryable",
      "migrationConfidence",
      "reviewStatus",
      "errorCode",
      "timestamp",
      "correlationId",
    ]);
    for (const key of Object.keys(outcome)) {
      expect(allowedKeys.has(key)).toBe(true);
    }
  });
});
