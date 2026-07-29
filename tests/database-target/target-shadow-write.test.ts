import { describe, expect, it, vi } from "vitest";
import {
  InMemoryIdempotencyStore,
  retryShadowWrite,
  runShadowWrite,
  type ShadowWriteRecord,
} from "../../src/lib/database-target/shadow-write/shadowWriteRunner";
import {
  shadowWriteExternalEvent,
  shadowWriteHelpRequestDomain,
  shadowWriteKnowledgeIncident,
  shadowWriteReport,
} from "../../src/lib/database-target/shadow-write/domains";
import type { LegacyReportRecord } from "../../src/lib/database-target/adapters/evidence";
import type { LegacyHelpRequestRecord } from "../../src/lib/database-target/adapters/help";
import type { LegacyKnowledgeIncidentRecord, LegacyStatusMappingTable } from "../../src/lib/database-target/adapters/incident";

const DISABLED = { shadowWriteEnabled: false };
const ENABLED = { shadowWriteEnabled: true };

describe("runShadowWrite generic engine", () => {
  it("never invokes the legacy write itself — only operates on an already-produced legacy result", () => {
    const legacyResult = { id: "x1" };
    const record = runShadowWrite(legacyResult, {
      domain: "TestDomain",
      legacyId: (r) => r.id,
      idempotencyKey: (r) => `test:${r.id}`,
      targetTransform: () => ({ kind: "PERSISTED", target: { ok: true }, legacyId: "x1", migrationConfidence: "HIGH", reviewStatus: "AUTO_MAPPED" }),
      ctx: ENABLED,
    });
    expect(record.legacyId).toBe("x1");
    expect(record.outcome.kind).toBe("PERSISTED");
  });

  it("returns NOT_ENABLED and never calls targetTransform when the flag is off", () => {
    const targetTransform = vi.fn();
    const record = runShadowWrite(
      { id: "x1" },
      { domain: "TestDomain", legacyId: (r) => r.id, idempotencyKey: (r) => r.id, targetTransform, ctx: DISABLED }
    );
    expect(record.outcome.kind).toBe("NOT_ENABLED");
    expect(targetTransform).not.toHaveBeenCalled();
  });

  it("does not break/throw when targetTransform throws — captures a TRANSFORM_FAILED reconciliation error instead (requirement 8/9/11)", () => {
    const onOutcome = vi.fn();
    const record = runShadowWrite(
      { id: "x1" },
      {
        domain: "TestDomain",
        legacyId: (r) => r.id,
        idempotencyKey: (r) => r.id,
        targetTransform: () => {
          throw new Error("boom");
        },
        ctx: ENABLED,
        onOutcome,
      }
    );
    expect(record.outcome.kind).toBe("ERROR");
    if (record.outcome.kind === "ERROR") {
      expect(record.outcome.error.code).toBe("TRANSFORM_FAILED");
      expect(record.outcome.error.message).toMatch(/boom/);
    }
    expect(record.retryable).toBe(true);
    expect(onOutcome).toHaveBeenCalledWith(record);
  });

  it("is idempotent — a second run with the same idempotency key after success does not re-persist", () => {
    const store = new InMemoryIdempotencyStore();
    const targetTransform = vi.fn().mockReturnValue({
      kind: "PERSISTED",
      target: { ok: true },
      legacyId: "x1",
      migrationConfidence: "HIGH",
      reviewStatus: "AUTO_MAPPED",
    });
    const options = {
      domain: "TestDomain",
      legacyId: (r: { id: string }) => r.id,
      idempotencyKey: (r: { id: string }) => `key:${r.id}`,
      targetTransform,
      ctx: ENABLED,
      idempotencyStore: store,
    };
    const first = runShadowWrite({ id: "x1" }, options);
    const second = runShadowWrite({ id: "x1" }, options);
    expect(first.outcome.kind).toBe("PERSISTED");
    expect(second.outcome.kind).toBe("NOT_ENABLED");
    expect(targetTransform).toHaveBeenCalledTimes(1);
  });

  it("retryShadowWrite re-attempts a retryable outcome", () => {
    let attempt = 0;
    const options = {
      domain: "TestDomain",
      legacyId: (r: { id: string }) => r.id,
      idempotencyKey: (r: { id: string }) => `key:${r.id}`,
      targetTransform: () => {
        attempt += 1;
        if (attempt === 1) {
          return { kind: "REQUIRES_REVIEW" as const, reason: "needs a human" };
        }
        return {
          kind: "PERSISTED" as const,
          target: { ok: true },
          legacyId: "x1",
          migrationConfidence: "HIGH" as const,
          reviewStatus: "AUTO_MAPPED" as const,
        };
      },
      ctx: ENABLED,
    };
    const first = runShadowWrite({ id: "x1" }, options);
    expect(first.outcome.kind).toBe("REQUIRES_REVIEW");
    expect(first.retryable).toBe(true);

    const second = retryShadowWrite(first, { id: "x1" }, options);
    expect(second.outcome.kind).toBe("PERSISTED");
  });

  it("retryShadowWrite is a no-op when the previous outcome was not retryable", () => {
    const targetTransform = vi.fn();
    const notRetryable: ShadowWriteRecord<unknown> = {
      domain: "TestDomain",
      legacyId: "x1",
      idempotencyKey: "key:x1",
      outcome: { kind: "NOT_ENABLED", reason: "disabled" },
      retryable: false,
      attemptedAt: new Date().toISOString(),
    };
    const result = retryShadowWrite(notRetryable, { id: "x1" }, {
      domain: "TestDomain",
      legacyId: (r: { id: string }) => r.id,
      idempotencyKey: (r: { id: string }) => r.id,
      targetTransform,
      ctx: ENABLED,
    });
    expect(result).toBe(notRetryable);
    expect(targetTransform).not.toHaveBeenCalled();
  });
});

describe("shadow-write domain wiring", () => {
  const report: LegacyReportRecord = {
    id: "report_1",
    userId: "user_1",
    title: "Incendio",
    description: "humo",
    latitude: -33.0,
    longitude: -70.0,
    status: "NEW",
    createdAt: new Date(),
  };

  it("shadowWriteReport is disabled by default", () => {
    expect(shadowWriteReport(report, { ctx: DISABLED }).outcome.kind).toBe("NOT_ENABLED");
  });

  it("shadowWriteReport persists when enabled", () => {
    expect(shadowWriteReport(report, { ctx: ENABLED }).outcome.kind).toBe("PERSISTED");
  });

  it("shadowWriteExternalEvent is disabled by default", () => {
    const ee = { id: "ee_1", sourceId: "src_1", title: "Sismo", description: null, latitude: null, longitude: null, createdAt: new Date() };
    expect(shadowWriteExternalEvent(ee, { ctx: DISABLED }).outcome.kind).toBe("NOT_ENABLED");
  });

  it("shadowWriteHelpRequestDomain persists when enabled", () => {
    const hr: LegacyHelpRequestRecord = {
      id: "hr_1",
      userId: "user_1",
      title: "Agua",
      description: "sin agua",
      latitude: -33.1,
      longitude: -70.1,
      status: "RECEIVED",
      createdAt: new Date(),
    };
    expect(shadowWriteHelpRequestDomain(hr, { ctx: ENABLED }).outcome.kind).toBe("PERSISTED");
  });

  it("shadowWriteKnowledgeIncident is REQUIRES_REVIEW without an approved mapping — never a fabricated PERSISTED", () => {
    const ki: LegacyKnowledgeIncidentRecord = {
      id: "ki_1",
      title: "Incendio forestal",
      summary: "zona X",
      status: "active",
      verificationStatus: "confirmed",
      effectiveSeverity: "high",
      incidentTypeId: "type_1",
      createdAt: new Date(),
    };
    const emptyTable: LegacyStatusMappingTable = new Map();
    const record = shadowWriteKnowledgeIncident(ki, emptyTable, { ctx: ENABLED });
    expect(record.outcome.kind).toBe("REQUIRES_REVIEW");
  });
});
