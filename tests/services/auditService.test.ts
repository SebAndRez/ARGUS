import { describe, expect, it } from "vitest";
import { buildSanctionAuditMetadata } from "@/services/auditService";

/**
 * ARGUS Prompt 20 — converted from `src/services/__tests__/auditService.test.ts`
 * (a `runAuditServiceSanctionMetadataTest()` export Vitest never ran).
 * Covers audit P0-3: `POST /api/sanctions` must produce an auditable
 * metadata shape for every sanction it creates. `logAuditEvent` itself is a
 * direct Prisma write not covered here — this tests the pure
 * metadata-shaping logic the route calls before writing.
 */
describe("buildSanctionAuditMetadata", () => {
  const metadata = buildSanctionAuditMetadata({
    sanctionId: "sanction-1",
    targetUserId: "user-1",
    sanctionType: "BAN",
    reason: "Reportes falsos reiterados.",
    previousAccountStatus: "ACTIVE",
    nextAccountStatus: "BANNED",
  });

  it("P0-3: preserves sanctionId", () => {
    expect(metadata.sanctionId).toBe("sanction-1");
  });

  it("P0-3: preserves targetUserId", () => {
    expect(metadata.targetUserId).toBe("user-1");
  });

  it("P0-3: preserves sanctionType", () => {
    expect(metadata.sanctionType).toBe("BAN");
  });

  it("P0-3: preserves the reason text", () => {
    expect(metadata.reason).toBe("Reportes falsos reiterados.");
  });

  it("P0-3: preserves previousAccountStatus", () => {
    expect(metadata.previousAccountStatus).toBe("ACTIVE");
  });

  it("P0-3: preserves nextAccountStatus", () => {
    expect(metadata.nextAccountStatus).toBe("BANNED");
  });
});
