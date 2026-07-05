import { auditModuleAccess } from "@/lib/modules/moduleAccess";
import { ARCA_MODULE_ID } from "@/modules/arca/arcaAccess";

/**
 * Auditoría de acciones sensibles de ARCA: refugio creado/actualizado,
 * estado/capacidad/servicios cambiados, necesidad registrada/resuelta,
 * refugio enviado a HERMES, necesidad enviada a NEXUS, resumen enviado a
 * ATLAS, exportación de datos, acceso a notas internas.
 *
 * Reutiliza el mismo placeholder de auditoría del resto de módulos ARGUS.
 */
export function auditArcaAction(payload: {
  userId?: string;
  userRole: string;
  action: string;
  shelterId?: string;
  needId?: string;
  reason?: string;
  timestamp?: string;
}) {
  return auditModuleAccess({
    moduleId: ARCA_MODULE_ID,
    userRole: payload.userRole,
    action: payload.action,
    reason: [
      payload.shelterId ? `shelter:${payload.shelterId}` : null,
      payload.needId ? `need:${payload.needId}` : null,
      payload.reason,
    ]
      .filter(Boolean)
      .join(" · ") || undefined,
    timestamp: payload.timestamp ?? new Date().toISOString(),
  });
}
