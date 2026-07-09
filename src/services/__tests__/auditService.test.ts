import { buildSanctionAuditMetadata } from "@/services/auditService";

/**
 * Covers ARGUS audit P0-3: `POST /api/sanctions` (the route AtlasDashboard
 * actually calls) must produce an auditable metadata shape for every
 * sanction it creates. `logAuditEvent` itself is a direct Prisma write with
 * no test-runner/mocking harness available in this repo yet, so this tests
 * the pure metadata-shaping logic that route now calls before writing —
 * the actual `AuditLog` row content is what this proves, even though the
 * DB write path itself isn't covered by an automated test here.
 */
export function runAuditServiceSanctionMetadataTest() {
  const metadata = buildSanctionAuditMetadata({
    sanctionId: "sanction-1",
    targetUserId: "user-1",
    sanctionType: "BAN",
    reason: "Reportes falsos reiterados.",
    previousAccountStatus: "ACTIVE",
    nextAccountStatus: "BANNED",
  });

  return {
    passed:
      metadata.sanctionId === "sanction-1" &&
      metadata.targetUserId === "user-1" &&
      metadata.sanctionType === "BAN" &&
      metadata.reason === "Reportes falsos reiterados." &&
      metadata.previousAccountStatus === "ACTIVE" &&
      metadata.nextAccountStatus === "BANNED",
    metadata,
  };
}
