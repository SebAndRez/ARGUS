import type { SessionUser } from "@/types/crisis";
import type { ArgusRole } from "@/types/rbac";
import { mapSessionUserToArgusRole } from "@/lib/modules/moduleAccess";
import type { FenixFeature } from "@/modules/fenix/types";

const allowed: ArgusRole[] = ["ANALYST", "OPERATOR", "INSTITUTIONAL_ADMIN", "ADMIN", "SUPER_ADMIN"];

export function resolveFenixRole(user?: SessionUser | null): ArgusRole {
  return mapSessionUserToArgusRole(user);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for API parity with sibling modules' canUseXFeature(role, feature) signature; FENIX gates coarsely (no per-feature distinction yet).
export function canUseFenixFeature(userOrRole: SessionUser | ArgusRole | null | undefined, _feature: FenixFeature) {
  const role = typeof userOrRole === "string" ? userOrRole : resolveFenixRole(userOrRole);
  return allowed.includes(role);
}

export function resolveFenixModuleAccess(role: ArgusRole) {
  if (allowed.includes(role)) return { canView: true, canEnter: true };
  return { canView: true, canEnter: false, reason: "FENIX es institucional/predictivo y no esta disponible para usuarios publicos." };
}
