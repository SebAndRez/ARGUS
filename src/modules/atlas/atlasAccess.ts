import { getModuleById } from "@/data/argusModules";
import {
  auditModuleAccess,
  canAccessModule,
  mapSessionUserToArgusRole,
} from "@/lib/modules/moduleAccess";
import type { SessionUser } from "@/types/crisis";
import type { ArgusRole } from "@/types/rbac";

export const ATLAS_MODULE_ID = "argus-atlas";

/**
 * ATLAS reutiliza el registro y el motor de acceso creados para el resto de
 * módulos ARGUS (`src/data/argusModules.ts` + `src/lib/modules/moduleAccess.ts`).
 * No define una segunda fuente de verdad de roles: `allowedRoles` de
 * "argus-atlas" ya es `[ANALYST, INSTITUTIONAL_ADMIN, ADMIN, SUPER_ADMIN]`,
 * por lo que un usuario con rol POLICE solo entra si además cuenta con un rol
 * institucional o superior (ADMIN/SUPER_ADMIN) — nunca por ser policía en
 * sí mismo.
 */
export function getAtlasModule() {
  const atlasModule = getModuleById(ATLAS_MODULE_ID);
  if (!atlasModule) {
    throw new Error("ARGUS ATLAS module definition is missing from the registry.");
  }
  return atlasModule;
}

export function resolveAtlasRole(user: SessionUser | null | undefined): ArgusRole {
  return mapSessionUserToArgusRole(user);
}

export function resolveAtlasAccess(userRole: ArgusRole) {
  return canAccessModule(userRole, getAtlasModule());
}

export function auditAtlasAccess(userRole: ArgusRole, action: string, reason?: string) {
  return auditModuleAccess({
    moduleId: ATLAS_MODULE_ID,
    userRole,
    action,
    reason,
    timestamp: new Date().toISOString(),
  });
}
