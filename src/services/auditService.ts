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
