import { auditModuleAccess } from "@/lib/modules/moduleAccess";
import { ORACULO_MODULE_ID } from "@/modules/oraculo/oraculoAccess";

/**
 * Auditoría de acciones sensibles de ORÁCULO: fuente agregada/deshabilitada/
 * marcada para revisión, evidencia verificada/rechazada, contradicción
 * revisada, evidencia enviada a TALOS/ATLAS, conector activado/desactivado.
 *
 * Reutiliza el mismo placeholder de auditoría del resto de módulos ARGUS
 * (`src/lib/modules/moduleAccess.ts` → `auditModuleAccess`, que ya sigue el
 * patrón de `src/lib/access/accessAudit.ts`: `console.info` gateado por
 * `NODE_ENV`). Si en el futuro existe un endpoint dedicado
 * (`/api/oraculo/*` o el `auditService` real basado en Prisma), este es el
 * único punto que hay que cambiar.
 */
export function auditOraculoAction(payload: {
  userId?: string;
  userRole: string;
  action: string;
  sourceId?: string;
  evidenceId?: string;
  reason?: string;
  timestamp?: string;
}) {
  return auditModuleAccess({
    moduleId: ORACULO_MODULE_ID,
    userRole: payload.userRole,
    action: payload.action,
    reason: [
      payload.sourceId ? `source:${payload.sourceId}` : null,
      payload.evidenceId ? `evidence:${payload.evidenceId}` : null,
      payload.reason,
    ]
      .filter(Boolean)
      .join(" · ") || undefined,
    timestamp: payload.timestamp ?? new Date().toISOString(),
  });
}
