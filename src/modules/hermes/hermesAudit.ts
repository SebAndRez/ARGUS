import { auditModuleAccess } from "@/lib/modules/moduleAccess";
import { HERMES_MODULE_ID } from "@/modules/hermes/hermesAccess";

/**
 * Auditoría de acciones sensibles de HERMES: ruta calculada/de evacuación/
 * médica/logística generada, bloqueo confirmado/despejado, ruta enviada a
 * ATLAS/FÉNIX, exportación de ruta, acceso a capas operativas.
 *
 * Reutiliza el mismo placeholder de auditoría del resto de módulos ARGUS.
 * Si en el futuro existe un endpoint dedicado (`/api/hermes/*`) o se conecta
 * al `auditService` real (Prisma), este es el único punto que hay que
 * cambiar.
 */
export function auditHermesAction(payload: {
  userId?: string;
  userRole: string;
  action: string;
  routeId?: string;
  blockageId?: string;
  reason?: string;
  timestamp?: string;
}) {
  return auditModuleAccess({
    moduleId: HERMES_MODULE_ID,
    userRole: payload.userRole,
    action: payload.action,
    reason: [
      payload.routeId ? `route:${payload.routeId}` : null,
      payload.blockageId ? `blockage:${payload.blockageId}` : null,
      payload.reason,
    ]
      .filter(Boolean)
      .join(" · ") || undefined,
    timestamp: payload.timestamp ?? new Date().toISOString(),
  });
}
