import { describe, expect, it } from "vitest";
import { compareDualRead, type DualReadComparable } from "../../src/lib/database-target/dual-read/compare";

const base: DualReadComparable = {
  id: "abc",
  status: "ACTIVE",
  timestamps: { createdAt: "2026-01-01T00:00:00Z" },
  jurisdictionId: "jur_1",
  geometry: { latitude: -33.45, longitude: -70.66 },
  classification: "OPERATIONAL",
  relations: ["r1", "r2"],
  publicRedaction: { title: "public title" },
};

describe("compareDualRead", () => {
  it("returns TARGET_MISSING when only legacy exists", () => {
    expect(compareDualRead(base, null)).toEqual({ overall: "TARGET_MISSING", fields: [] });
  });

  it("returns LEGACY_MISSING when only target exists", () => {
    expect(compareDualRead(null, base)).toEqual({ overall: "LEGACY_MISSING", fields: [] });
  });

  it("returns DATA_ERROR when both sides are null (caller bug, never silently OK)", () => {
    expect(compareDualRead(null, null).overall).toBe("DATA_ERROR");
  });

  it("returns MATCH for two identical records", () => {
    const report = compareDualRead(base, { ...base });
    expect(report.overall).toBe("MATCH");
    expect(report.fields.every((f) => f.result === "MATCH")).toBe(true);
  });

  it("flags an id mismatch as DATA_ERROR", () => {
    const report = compareDualRead(base, { ...base, id: "different" });
    expect(report.overall).toBe("DATA_ERROR");
  });

  it("flags a classification mismatch as DATA_ERROR (security-relevant)", () => {
    const report = compareDualRead(base, { ...base, classification: "RESTRICTED" });
    expect(report.overall).toBe("DATA_ERROR");
  });

  it("flags a status mismatch as MIGRATION_GAP by default", () => {
    const report = compareDualRead(base, { ...base, status: "CLOSED" });
    expect(report.overall).toBe("MIGRATION_GAP");
  });

  it("downgrades an expected status difference to EXPECTED_DIFFERENCE when named", () => {
    const report = compareDualRead(base, { ...base, status: "CLOSED" }, { expectedDifferenceFields: new Set(["status"]) });
    expect(report.overall).toBe("EXPECTED_DIFFERENCE");
  });

  it("flags a geometry drift beyond tolerance as DATA_ERROR", () => {
    const report = compareDualRead(base, { ...base, geometry: { latitude: -34.0, longitude: -70.66 } });
    expect(report.overall).toBe("DATA_ERROR");
  });

  it("allows geometry drift within tolerance", () => {
    const report = compareDualRead(base, { ...base, geometry: { latitude: -33.45, longitude: -70.66 } }, { geometryToleranceDegrees: 0.001 });
    expect(report.overall).toBe("MATCH");
  });

  it("flags mismatched relations as MIGRATION_GAP, order-independent", () => {
    const reordered = compareDualRead(base, { ...base, relations: ["r2", "r1"] });
    expect(reordered.overall).toBe("MATCH");

    const different = compareDualRead(base, { ...base, relations: ["r1", "r3"] });
    expect(different.overall).toBe("MIGRATION_GAP");
  });

  it("flags a public-redaction divergence as DATA_ERROR", () => {
    const report = compareDualRead(base, { ...base, publicRedaction: { title: "different public title" } });
    expect(report.overall).toBe("DATA_ERROR");
  });

  it("flags a timestamp mismatch as MIGRATION_GAP", () => {
    const report = compareDualRead(base, { ...base, timestamps: { createdAt: "2026-02-01T00:00:00Z" } });
    expect(report.overall).toBe("MIGRATION_GAP");
  });

  it("never returns a field list when TARGET_MISSING/LEGACY_MISSING (nothing to compare)", () => {
    expect(compareDualRead(base, null).fields).toHaveLength(0);
    expect(compareDualRead(null, base).fields).toHaveLength(0);
  });
});
