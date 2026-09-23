import { prisma } from "@/lib/prisma";
import { shadowWriteAfterLegacyWrite } from "@/lib/database-target/shadow-write/legacyShadowSync";

export async function logAuditEvent(options: {
  actorUserId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: unknown;
}) {
  const entry = await prisma.auditLog.create({
    data: {
      actorUserId: options.actorUserId,
      action: options.action,
      targetType: options.targetType,
      targetId: options.targetId,
      metadata: options.metadata ? JSON.stringify(options.metadata) : null,
    },
  });

  // Dual-write of audit events (Ola 1 §9 of the executable plan, connected in
  // Paso 5): the legacy AuditLog row above is the source of truth; this mirrors
  // it into security.audit_logs through Wave 010's own sync function, which
  // signs each row with the session integrity key and REFUSES to write without
  // one (AUDIT_INTEGRITY_KEY_MISSING). In production that key is the pending
  // KMS decision, so the shadow write fails closed there — visibly, as a
  // TARGET_WRITE_FAILED outcome, never as a row signed with a fake key.
  await shadowWriteAfterLegacyWrite("AuditLog", [entry.id]);

  return entry;
}

/**
 * Pure metadata shape for a `SANCTION_CREATED` audit entry — split out from
 * the route handler (`src/app/api/sanctions/route.ts`) so it's unit-testable
 * without a database, since `logAuditEvent` itself is a direct Prisma write.
 */
export function buildSanctionAuditMetadata(input: {
  sanctionId: string;
  targetUserId: string;
  sanctionType: string;
  reason: string;
  previousAccountStatus: string;
  nextAccountStatus: string;
}) {
  return {
    sanctionId: input.sanctionId,
    targetUserId: input.targetUserId,
    sanctionType: input.sanctionType,
    reason: input.reason,
    previousAccountStatus: input.previousAccountStatus,
    nextAccountStatus: input.nextAccountStatus,
  };
}
