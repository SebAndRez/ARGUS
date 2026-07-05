import { auditModuleAccess } from "@/lib/modules/moduleAccess";
import { TALOS_MODULE_ID } from "@/modules/talos/talosAccess";

/**
 * Auditoría de acciones sensibles de TALOS: evaluación generada/recalculada/
 * enviada a ATLAS o FÉNIX/exportada, riesgo sobrescrito manualmente,
 * explicación consultada, contexto sensible visualizado.
 *
 * Reutiliza el mismo placeholder de auditoría del resto de módulos ARGUS
 * (`src/lib/modules/moduleAccess.ts` → `auditModuleAccess`). Si en el futuro
 * existe un endpoint dedicado (`/api/talos/*`) o se conecta al
 * `auditService` real (Prisma), este es el único punto que hay que cambiar.
 */
export function auditTalosAction(payload: {
  userId?: string;
  userRole: string;
  action: string;
  assessmentId?: string;
  eventId?: string;
  reason?: string;
  timestamp?: string;
}) {
  return auditModuleAccess({
    moduleId: TALOS_MODULE_ID,
    userRole: payload.userRole,
    action: payload.action,
    reason: [
      payload.assessmentId ? `assessment:${payload.assessmentId}` : null,
      payload.eventId ? `event:${payload.eventId}` : null,
      payload.reason,
    ]
      .filter(Boolean)
      .join(" · ") || undefined,
    timestamp: payload.timestamp ?? new Date().toISOString(),
  });
}
