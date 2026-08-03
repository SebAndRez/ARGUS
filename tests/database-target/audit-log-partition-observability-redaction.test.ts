import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  recordAuditPartitionCreated,
  recordAuditPartitionEnsureAttempt,
  recordAuditPartitionEnsureLatencyMs,
  recordAuditPartitionExisting,
  recordAuditPartitionFailure,
  recordAuditPartitionMaintenanceSkipped,
  recordAuditPartitionWindowGap,
} from "../../src/lib/database-target/observability/auditPartitionMetrics";
import { readRepoFile } from "./auditPartitionTestHelpers";

/**
 * tests/database-target/audit-log-partition-observability-redaction.test.ts
 *
 * The 7 audit-partition metrics must be emittable under exactly the specified
 * names and must be structurally incapable of carrying audit content, actor
 * or target identity, contact details, coordinates, free-text reasons, or
 * metadata.
 */

function captureConsole() {
  const calls: string[] = [];
  const spy = (level: "debug" | "info" | "warn" | "error") =>
    vi.spyOn(console, level).mockImplementation((msg: string) => {
      calls.push(msg);
    });
  return { calls, debug: spy("debug"), info: spy("info"), warn: spy("warn"), error: spy("error") };
}

const ALL_SEVEN = [
  "audit_partition_ensure_attempt_total",
  "audit_partition_created_total",
  "audit_partition_existing_total",
  "audit_partition_failure_total",
  "audit_partition_window_gap_total",
  "audit_partition_maintenance_skipped_total",
  "audit_partition_ensure_latency_ms",
];

function emitAll(): void {
  const labels = { year: 2026, month: 8, process: "audit-writer" as const };
  recordAuditPartitionEnsureAttempt(labels);
  recordAuditPartitionCreated(labels);
  recordAuditPartitionExisting(labels);
  recordAuditPartitionFailure({ ...labels, errorCode: "AUDIT_PARTITION_BOUND_MISMATCH" });
  recordAuditPartitionWindowGap({ count: 2, process: "window-maintenance" });
  recordAuditPartitionMaintenanceSkipped({ reason: "NOT_ENABLED" });
  recordAuditPartitionEnsureLatencyMs({ durationMs: 17, process: "window-maintenance" });
}

describe("audit partition observability — names and redaction", () => {
  let capture: ReturnType<typeof captureConsole>;

  beforeEach(() => {
    capture = captureConsole();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits all 7 metric names exactly as specified", () => {
    emitAll();
    const combined = capture.calls.join("\n");
    for (const name of ALL_SEVEN) {
      expect(combined, `${name} was not emitted`).toContain(name);
    }
  });

  it("carries only the allowed labels: result, year/month, technical process, safe error code, duration, count", () => {
    emitAll();
    for (const line of capture.calls) {
      const payload = JSON.parse(line.replace("[argus:observability] ", "")) as Record<string, unknown>;
      const allowed = new Set([
        "timestamp",
        "level",
        "event",
        "component",
        "environment",
        "moduleId", // YYYY-MM
        "outcome", // technical process / NOT_ENABLED
        "errorCode",
        "durationMs",
        "count",
      ]);
      for (const key of Object.keys(payload)) {
        expect(allowed.has(key), `unexpected label "${key}" in ${line}`).toBe(true);
      }
    }
  });

  it("never emits audit content, actor/target identity, contact details, coordinates, or free-text reasons", () => {
    emitAll();
    const combined = capture.calls.join("\n").toLowerCase();
    for (const forbidden of [
      "actorid",
      "actor_id",
      "targetid",
      "target_id",
      "email",
      "phone",
      "latitude",
      "longitude",
      "coordinate",
      "reason",
      "metadata",
      "beforestate",
      "afterstate",
      "before_state",
      "after_state",
      "context",
      "integrity_value",
      "purpose",
    ]) {
      expect(combined, `metrics leaked "${forbidden}"`).not.toContain(forbidden);
    }
    // `ip` as a standalone key or an actual address — matched precisely, since
    // the bare substring also occurs inside harmless words like "skipped".
    expect(combined, "metrics leaked an ip field").not.toMatch(/"ip(address|_address)?"\s*:/);
    expect(combined, "metrics leaked a dotted-quad address").not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
  });

  it("the year/month label is exactly YYYY-MM, zero-padded, with no day or time component", () => {
    recordAuditPartitionCreated({ year: 2027, month: 1, process: "backfill" });
    const payload = JSON.parse(capture.calls[0]!.replace("[argus:observability] ", "")) as { moduleId: string };
    expect(payload.moduleId).toBe("2027-01");
  });

  it("a window gap with zero missing months is not escalated to warn", () => {
    recordAuditPartitionWindowGap({ count: 0, process: "window-maintenance" });
    const payload = JSON.parse(capture.calls[0]!.replace("[argus:observability] ", "")) as { level: string; count: number };
    expect(payload.level).toBe("debug");
    expect(payload.count).toBe(0);
  });

  it("a real gap IS escalated to warn so drift is visible", () => {
    recordAuditPartitionWindowGap({ count: 3, process: "window-maintenance" });
    const payload = JSON.parse(capture.calls[0]!.replace("[argus:observability] ", "")) as { level: string; count: number };
    expect(payload.level).toBe("warn");
    expect(payload.count).toBe(3);
  });
});

describe("audit partition observability — error codes are never raw exception text", () => {
  let capture: ReturnType<typeof captureConsole>;

  beforeEach(() => {
    capture = captureConsole();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("the repository extracts a fixed-vocabulary code rather than forwarding the message", async () => {
    const { ensureAuditLogPartition } = await import(
      "../../src/lib/database-target/repositories/auditLogPartitionRepository"
    );
    const failing = {
      $queryRawUnsafe: async () => {
        throw new Error(
          `AUDIT_PARTITION_BOUND_MISMATCH: relation audit_logs_y2026m08 has bound X — row (actor_id=aaaa, email=leak@example.invalid)`
        );
      },
      $executeRawUnsafe: async () => 0,
    };
    await expect(ensureAuditLogPartition(failing, new Date("2026-08-03T00:00:00Z"), "test")).rejects.toThrow();

    const failureLine = capture.calls.find((line) => line.includes("audit_partition_failure_total"))!;
    expect(failureLine).toContain("AUDIT_PARTITION_BOUND_MISMATCH");
    expect(failureLine).not.toContain("leak@example.invalid");
    expect(failureLine).not.toContain("actor_id=aaaa");
  });

  it("falls back to the Error name, never the message, for an unrecognized failure", async () => {
    const { ensureAuditLogPartition } = await import(
      "../../src/lib/database-target/repositories/auditLogPartitionRepository"
    );
    const err = new Error("connection terminated while writing row for user jane.doe@example.invalid");
    err.name = "PrismaClientKnownRequestError";
    const failing = {
      $queryRawUnsafe: async () => {
        throw err;
      },
      $executeRawUnsafe: async () => 0,
    };
    await expect(ensureAuditLogPartition(failing, new Date("2026-08-03T00:00:00Z"), "test")).rejects.toThrow();

    const failureLine = capture.calls.find((line) => line.includes("audit_partition_failure_total"))!;
    expect(failureLine).toContain("PrismaClientKnownRequestError");
    expect(failureLine).not.toContain("jane.doe@example.invalid");
  });
});

describe("audit partition observability — source-level guarantees", () => {
  const metrics = readRepoFile("src", "lib", "database-target", "observability", "auditPartitionMetrics.ts");
  // Comments legitimately NAME the fields that must never be logged (that is
  // the whole point of the module's header), so the check runs against code
  // only — otherwise the documentation would fail its own test.
  const code = metrics.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("no metric function accepts a parameter that could carry PII or audit content", () => {
    expect(code).not.toMatch(/actorId|targetId|email|phone|ipAddress|latitude|longitude|metadata|beforeState|afterState/);
    // `reason` exists only as the closed literal union `"NOT_ENABLED"`, never
    // as free text.
    const reasonDeclarations = Array.from(code.matchAll(/reason\s*:\s*([^;}]+)/g)).map((m) => m[1]!.trim());
    expect(reasonDeclarations).toEqual(['"NOT_ENABLED"']);
  });

  it("declares all 7 metric names and nothing else", () => {
    const events = Array.from(metrics.matchAll(/event: "([a-z_]+)"/g)).map((match) => match[1]!);
    expect(events.sort()).toEqual([...ALL_SEVEN].sort());
  });
});
