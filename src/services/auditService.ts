import { prisma } from "@/lib/prisma";

export async function logAuditEvent(options: {
  actorUserId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: unknown;
}) {
  return prisma.auditLog.create({
    data: {
      actorUserId: options.actorUserId,
      action: options.action,
      targetType: options.targetType,
      targetId: options.targetId,
      metadata: options.metadata ? JSON.stringify(options.metadata) : null,
    },
  });
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
