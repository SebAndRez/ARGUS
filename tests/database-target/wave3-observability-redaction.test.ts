import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  recordIdempotencyHit,
  recordIncidentCandidateCreated,
  recordIncidentCandidateDuplicate,
  recordReconciliationReview,
  recordShadowWriteAttempt,
  recordShadowWriteFailure,
  recordShadowWriteSkipped,
  recordShadowWriteSuccess,
  recordTargetLatencyMs,
} from "../../src/lib/database-target/observability/wave3Metrics";

function captureConsole() {
  const calls: string[] = [];
  const spy = (level: "debug" | "info" | "warn" | "error") =>
    vi.spyOn(console, level).mockImplementation((msg: string) => {
      calls.push(msg);
    });
  return { calls, debug: spy("debug"), info: spy("info"), warn: spy("warn"), error: spy("error") };
}

describe("wave3 observability metrics — no PII, no free-text content", () => {
  let capture: ReturnType<typeof captureConsole>;

  beforeEach(() => {
    capture = captureConsole();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const FORBIDDEN_SUBSTRINGS = ["email", "phone", "medical", "content", "evidence", "claimtext", "rawcontent"];

  function assertNoForbiddenContent() {
    const combined = capture.calls.join("\n").toLowerCase();
    for (const bad of FORBIDDEN_SUBSTRINGS) {
      expect(combined).not.toContain(bad);
    }
  }

  it("all 9 wave3 metric names appear exactly as specified", () => {
    recordShadowWriteAttempt({ domain: "ExternalEvent", legacyId: "ee_1" });
    recordShadowWriteSuccess({ domain: "ExternalEvent", legacyId: "ee_1" });
    recordShadowWriteFailure({ domain: "ExternalEvent", legacyId: "ee_1", errorCode: "Error" });
    recordShadowWriteSkipped({ domain: "ExternalEvent", legacyId: "ee_1" });
    recordIdempotencyHit({ domain: "ExternalEvent", legacyId: "ee_1", idempotencyKey: "key_1" });
    recordReconciliationReview({ domain: "ExternalEvent", legacyId: "ee_1" });
    recordIncidentCandidateCreated({ legacyId: "ki_1" });
    recordIncidentCandidateDuplicate({ legacyId: "ki_1" });
    recordTargetLatencyMs({ domain: "ExternalEvent", durationMs: 12 });

    const combined = capture.calls.join("\n");
    for (const name of [
      "wave3_shadow_write_attempt_total",
      "wave3_shadow_write_success_total",
      "wave3_shadow_write_failure_total",
      "wave3_shadow_write_skipped_total",
      "wave3_idempotency_hit_total",
      "wave3_reconciliation_review_total",
      "wave3_incident_candidate_created_total",
      "wave3_incident_candidate_duplicate_total",
      "wave3_target_latency_ms",
    ]) {
      expect(combined).toContain(name);
    }
  });

  it("never logs free-text content, names, emails, coordinates, or evidence across all 9 metrics", () => {
    recordShadowWriteAttempt({ domain: "Report", legacyId: "report_1" });
    recordShadowWriteSuccess({ domain: "Report", legacyId: "report_1" });
    recordShadowWriteFailure({ domain: "Report", legacyId: "report_1", errorCode: "PrismaClientKnownRequestError" });
    recordShadowWriteSkipped({ domain: "Report", legacyId: "report_1" });
    recordIdempotencyHit({ domain: "Report", legacyId: "report_1", idempotencyKey: "Report:report_1" });
    recordReconciliationReview({ domain: "Report", legacyId: "report_1" });
    recordIncidentCandidateCreated({ legacyId: "ki_1" });
    recordIncidentCandidateDuplicate({ legacyId: "ki_1" });
    recordTargetLatencyMs({ domain: "Report", durationMs: 42 });

    assertNoForbiddenContent();
  });

  it("labels/messages carry only opaque ids and enum-like values, never raw exception messages", () => {
    recordShadowWriteFailure({ domain: "ExternalEvent", legacyId: "ee_1", errorCode: "Error" });
    const combined = capture.calls.join("\n");
    expect(combined).not.toMatch(/duplicate key|constraint|stack/i);
  });
});
