import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  recordBackfillPending,
  recordIdempotencySkip,
  recordLegacyLatency,
  recordReadDiscrepancy,
  recordReviewQueueEntry,
  recordRollbackReadiness,
  recordShadowWriteAttempted,
  recordShadowWriteFailed,
  recordShadowWriteSucceeded,
  recordTargetLatency,
} from "../../src/lib/database-target/observability/metrics";

function captureConsole() {
  const calls: string[] = [];
  const spy = (level: "debug" | "info" | "warn" | "error") =>
    vi.spyOn(console, level).mockImplementation((msg: string) => {
      calls.push(msg);
    });
  return { calls, debug: spy("debug"), info: spy("info"), warn: spy("warn"), error: spy("error") };
}

describe("database-target observability metrics", () => {
  let capture: ReturnType<typeof captureConsole>;

  beforeEach(() => {
    capture = captureConsole();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const FORBIDDEN_SUBSTRINGS = ["email", "phone", "medical", "name", "content", "evidence"];

  function assertNoForbiddenContent() {
    const combined = capture.calls.join("\n").toLowerCase();
    for (const bad of FORBIDDEN_SUBSTRINGS) {
      expect(combined).not.toContain(bad);
    }
  }

  it("recordShadowWriteAttempted logs domain/legacyId only", () => {
    recordShadowWriteAttempted({ domain: "Report", legacyId: "report_1" });
    expect(capture.calls.join("")).toMatch(/shadow_write\.attempted/);
    assertNoForbiddenContent();
  });

  it("recordShadowWriteSucceeded logs without PII", () => {
    recordShadowWriteSucceeded({ domain: "HelpRequest", legacyId: "hr_1", durationMs: 12 });
    expect(capture.calls.join("")).toMatch(/shadow_write\.succeeded/);
    assertNoForbiddenContent();
  });

  it("recordShadowWriteFailed logs the error code without PII", () => {
    recordShadowWriteFailed({ domain: "KnowledgeIncident", legacyId: "ki_1", errorCode: "TRANSFORM_FAILED" });
    expect(capture.calls.join("")).toMatch(/shadow_write\.failed/);
    assertNoForbiddenContent();
  });

  it("recordReadDiscrepancy logs the discrepancy kind without PII", () => {
    recordReadDiscrepancy({ domain: "Incident", legacyId: "i1", discrepancyKind: "MIGRATION_GAP" });
    expect(capture.calls.join("")).toMatch(/dual_read\.discrepancy/);
    assertNoForbiddenContent();
  });

  it("recordBackfillPending logs a count", () => {
    recordBackfillPending({ domain: "CriticalPoi", pendingCount: 42 });
    expect(capture.calls.join("")).toMatch(/backfill\.pending/);
    expect(capture.calls.join("")).toMatch(/"count":42/);
  });

  it("recordReviewQueueEntry logs without PII", () => {
    recordReviewQueueEntry({ domain: "CriticalPoi", legacyId: "poi_1" });
    expect(capture.calls.join("")).toMatch(/review_queue\.entered/);
    assertNoForbiddenContent();
  });

  it("recordIdempotencySkip logs the idempotency key as an opaque id", () => {
    recordIdempotencySkip({ domain: "Report", legacyId: "report_1", idempotencyKey: "report:report_1" });
    expect(capture.calls.join("")).toMatch(/idempotent_skip/);
    assertNoForbiddenContent();
  });

  it("recordLegacyLatency / recordTargetLatency log durations", () => {
    recordLegacyLatency({ domain: "Incident", durationMs: 5 });
    recordTargetLatency({ domain: "Incident", durationMs: 7 });
    const combined = capture.calls.join("");
    expect(combined).toMatch(/read\.legacy_latency/);
    expect(combined).toMatch(/read\.target_latency/);
  });

  it("recordRollbackReadiness logs warn with an error code when not ready", () => {
    recordRollbackReadiness({ wave: "040_incident", ready: false });
    expect(capture.warn).toHaveBeenCalled();
    expect(capture.calls.join("")).toMatch(/ROLLBACK_NOT_READY/);
  });

  it("recordRollbackReadiness logs info without an error code when ready", () => {
    recordRollbackReadiness({ wave: "040_incident", ready: true });
    expect(capture.info).toHaveBeenCalled();
    expect(capture.calls.join("")).not.toMatch(/errorCode/);
  });
});
