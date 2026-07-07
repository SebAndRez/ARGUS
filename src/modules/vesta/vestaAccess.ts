import type { SessionUser } from "@/types/crisis";
import type { ArgusRole } from "@/types/rbac";
import { getModuleById } from "@/data/argusModules";
import { canAccessModule, mapSessionUserToArgusRole } from "@/lib/modules/moduleAccess";

export const VESTA_MODULE_ID = "argus-vesta";

export function getVestaModule() {
  const vestaModule = getModuleById(VESTA_MODULE_ID);
  if (!vestaModule) {
    throw new Error("ARGUS VESTA module definition is missing from the registry.");
  }
  return vestaModule;
}

export function resolveVestaRole(user?: SessionUser | null): ArgusRole {
  return mapSessionUserToArgusRole(user);
}

export function resolveVestaModuleAccess(role: ArgusRole) {
  return canAccessModule(role, getVestaModule());
}
