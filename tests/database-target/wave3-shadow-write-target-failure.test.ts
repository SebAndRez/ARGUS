import { describe, expect, it, vi } from "vitest";
import { shadowWriteExternalEventWave3, shadowWriteReportWave3 } from "../../src/lib/database-target/shadow-write/wave3Domains";
import type { LegacyExternalEventRecordFull, LegacyReportRecordFull } from "../../src/lib/database-target/adapters/wave3Transformers";

const ENABLED = { shadowWriteEnabled: true };

describe("wave3 shadow write — target failure never breaks the legacy flow (Fase 12.C / Fase 8.6)", () => {
  it("a persist() rejection never throws out of the shadow-write function", async () => {
    const persist = vi.fn().mockRejectedValue(new Error("connection refused"));
    const record: LegacyExternalEventRecordFull = {
      id: "ee_1", sourceId: "src_1", externalId: "ext_1", category: "wildfire", title: "t", description: null,
      severity: null, confidence: null, latitude: -33, longitude: -70, occurredAt: null, fetchedAt: new Date(),
      raw: null, createdAt: new Date(), ingestionRunId: "run_1",
    };
    await expect(shadowWriteExternalEventWave3(record, ENABLED, persist)).resolves.toBeDefined();
  });

  it("reports TARGET_WRITE_FAILED, retryable=true, with a safe error code (never the raw exception message)", async () => {
    const persist = vi.fn().mockRejectedValue(new Error("duplicate key value violates unique constraint \"uq_x\""));
    const record: LegacyExternalEventRecordFull = {
      id: "ee_1", sourceId: "src_1", externalId: "ext_1", category: "wildfire", title: "t", description: null,
      severity: null, confidence: null, latitude: -33, longitude: -70, occurredAt: null, fetchedAt: new Date(),
      raw: null, createdAt: new Date(), ingestionRunId: "run_1",
    };
    const result = await shadowWriteExternalEventWave3(record, ENABLED, persist);
    expect(result.kind).toBe("ATTEMPTED");
    if (result.kind === "ATTEMPTED") {
      expect(result.reconciliation.code).toBe("TARGET_WRITE_FAILED");
      expect(result.reconciliation.retryable).toBe(true);
      expect(result.reconciliation.errorCode).toBe("Error");
      expect(JSON.stringify(result.reconciliation)).not.toMatch(/uq_x|unique constraint/);
    }
  });

  it("preserves the legacy id even when the target write fails", async () => {
    const persist = vi.fn().mockRejectedValue(new Error("boom"));
    const record: LegacyReportRecordFull = {
      id: "report_99", userId: "user_1", title: "t", description: "d", latitude: -33, longitude: -70, status: "NEW", createdAt: new Date(),
    };
    const result = await shadowWriteReportWave3(record, ENABLED, persist);
    expect(result.kind).toBe("ATTEMPTED");
    if (result.kind === "ATTEMPTED") {
      expect(result.reconciliation.legacyId).toBe("report_99");
    }
  });
});
