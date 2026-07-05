import { getModuleById } from "@/data/argusModules";
import { auditModuleAccess, canAccessModule, mapSessionUserToArgusRole } from "@/lib/modules/moduleAccess";
import type { SessionUser } from "@/types/crisis";
import type { ArgusRole } from "@/types/rbac";
import type { VigiaFeature } from "@/modules/vigia/types";
import { canCreateNormalReport } from "@/modules/vigia/vigiaReputation";

export const VIGIA_MODULE_ID = "argus-vigia";

const validationRoles: ArgusRole[] = [
  "ANALYST",
  "INSTITUTIONAL_ADMIN",
  "OPERATOR",
  "ADMIN",
  "SUPER_ADMIN",
];

const moderationRoles: ArgusRole[] = ["ANALYST", "INSTITUTIONAL_ADMIN", "ADMIN", "SUPER_ADMIN"];

/**
 * VIGÍA reutiliza el registro y motor de acceso comunes de módulos ARGUS
 * (`src/data/argusModules.ts` + `src/lib/modules/moduleAccess.ts`). "argus-vigia"
 * ya está marcado como público/base ahí, por lo que `canView`/`canEnter`
 * siempre son `true` — el control fino de qué puede *hacer* cada rol dentro
 * del módulo vive en `canUseVigiaFeature`.
 */
export function getVigiaModule() {
  const vigiaModule = getModuleById(VIGIA_MODULE_ID);
  if (!vigiaModule) {
    throw new Error("ARGUS VIGÍA module definition is missing from the registry.");
  }
  return vigiaModule;
}

export function resolveVigiaRole(user: SessionUser | null | undefined): ArgusRole {
  return mapSessionUserToArgusRole(user);
}

export function resolveVigiaModuleAccess(userRole: ArgusRole) {
  return canAccessModule(userRole, getVigiaModule());
}

export function canUseVigiaFeature(
  user: SessionUser | null | undefined,
  feature: VigiaFeature
): boolean {
  const role = mapSessionUserToArgusRole(user);
  const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";

  switch (feature) {
    case "view":
      return true;
    case "create_report":
    case "upload_evidence":
      // Cualquier persona con sesión activa puede reportar, salvo que su
      // reputación la tenga bloqueada. SOS nunca pasa por esta regla.
      return Boolean(user) && canCreateNormalReport(user);
    case "validate_report":
    case "escalate_report":
      return isAdmin || validationRoles.includes(role);
    case "moderate_report":
      return isAdmin || moderationRoles.includes(role);
    case "view_reputation":
      return true;
    case "view_sensitive_details":
      return isAdmin || validationRoles.includes(role);
    default:
      return false;
  }
}

export function auditVigiaAction(payload: {
  reportId?: string;
  userId?: string;
  userRole: string;
  action: string;
  reason?: string;
}) {
  return auditModuleAccess({
    moduleId: VIGIA_MODULE_ID,
    userRole: payload.userRole,
    action: payload.action,
    reason: payload.reportId ? `report:${payload.reportId}${payload.reason ? ` · ${payload.reason}` : ""}` : payload.reason,
    timestamp: new Date().toISOString(),
  });
}
