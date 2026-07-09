import type { ArgusRole, RbacUser } from "@/types/rbac";

const roleRank: Record<ArgusRole, number> = {
  PUBLIC: 0,
  CITIZEN: 1,
  VERIFIED_CITIZEN: 2,
  TRUSTED_CITIZEN: 3,
  OPERATOR: 4,
  ANALYST: 4,
  MEDICAL_OPERATOR: 5,
  LOGISTICS: 5,
  INSTITUTIONAL_ADMIN: 6,
  POLICE: 6,
  AUTHORITY: 6,
  ADMIN: 7,
  SUPER_ADMIN: 8,
};

const commandRoles: ArgusRole[] = [
  "OPERATOR",
  "ANALYST",
  "INSTITUTIONAL_ADMIN",
  "ADMIN",
  "SUPER_ADMIN",
];

const medicalRoles: ArgusRole[] = [
  "MEDICAL_OPERATOR",
  "INSTITUTIONAL_ADMIN",
  "ADMIN",
  "SUPER_ADMIN",
];

function normalizeRole(role?: string | null): ArgusRole {
  if (!role) return "PUBLIC";
  if (role === "RESPONDER") return "OPERATOR";
  if (role in roleRank) return role as ArgusRole;
  return "PUBLIC";
}

export function hasRole(user: RbacUser | null | undefined, role: ArgusRole) {
  return roleRank[normalizeRole(user?.role)] >= roleRank[role];
}

export function hasAnyRole(user: RbacUser | null | undefined, roles: ArgusRole[]) {
  const role = normalizeRole(user?.role);
  return roles.includes(role);
}

/**
 * Central hierarchy-based access assertion. Prefer this (or `hasRole`) over
 * hardcoding literal role arrays in individual routes, since a literal list
 * silently drifts out of sync with the hierarchy (e.g. forgetting SUPER_ADMIN).
 */
export function assertCanAccess(user: RbacUser | null | undefined, minimumRole: ArgusRole) {
  return hasRole(user, minimumRole);
}

export function requirePermission(
  user: RbacUser | null | undefined,
  permission: (candidate: RbacUser | null | undefined) => boolean
) {
  return permission(user);
}

/**
 * Policy for mutating a user's role. Encodes: only ADMIN+ can change roles,
 * nobody can self-escalate, only SUPER_ADMIN can touch another SUPER_ADMIN's
 * role, and only SUPER_ADMIN can grant the SUPER_ADMIN role itself.
 */
export function canChangeUserRole(
  actor: RbacUser | null | undefined,
  target: { id: string; role?: string | null },
  nextRole: ArgusRole
): { allowed: boolean; reason?: string } {
  if (!hasRole(actor, "ADMIN")) {
    return { allowed: false, reason: "Solo ADMIN o SUPER_ADMIN pueden cambiar roles." };
  }
  if (actor?.id && actor.id === target.id) {
    return { allowed: false, reason: "No está permitido autoescalar el propio rol." };
  }
  if (normalizeRole(target.role) === "SUPER_ADMIN" && !hasRole(actor, "SUPER_ADMIN")) {
    return { allowed: false, reason: "Solo SUPER_ADMIN puede modificar a otro SUPER_ADMIN." };
  }
  if (nextRole === "SUPER_ADMIN" && !hasRole(actor, "SUPER_ADMIN")) {
    return { allowed: false, reason: "Solo SUPER_ADMIN puede otorgar el rol SUPER_ADMIN." };
  }
  return { allowed: true };
}

/**
 * Policy for mutating a user's `accountStatus` (ban/unban/suspend/restore).
 * Mirrors `canChangeUserRole`'s ADMIN+ floor and SUPER_ADMIN protection —
 * `requireOperator()` alone (OPERATOR/ANALYST included) is not sufficient
 * for this action, only for reading/listing users.
 */
export function canChangeAccountStatus(
  actor: RbacUser | null | undefined,
  target: { id: string; role?: string | null }
): { allowed: boolean; reason?: string } {
  if (!hasRole(actor, "ADMIN")) {
    return { allowed: false, reason: "Solo ADMIN o SUPER_ADMIN pueden cambiar el estado de la cuenta." };
  }
  if (normalizeRole(target.role) === "SUPER_ADMIN" && !hasRole(actor, "SUPER_ADMIN")) {
    return { allowed: false, reason: "Solo SUPER_ADMIN puede modificar el estado de otro SUPER_ADMIN." };
  }
  return { allowed: true };
}

export function canAccessDashboard(user: RbacUser | null | undefined) {
  return hasAnyRole(user, commandRoles);
}

export function canAccessCommandCenter(user: RbacUser | null | undefined) {
  return hasAnyRole(user, commandRoles);
}

export function canViewSensitiveIncident(user: RbacUser | null | undefined) {
  return hasAnyRole(user, commandRoles);
}

export function canViewMedicalData(user: RbacUser | null | undefined) {
  return hasAnyRole(user, medicalRoles);
}

export function canManageUsers(user: RbacUser | null | undefined) {
  return hasAnyRole(user, ["ADMIN", "SUPER_ADMIN"]);
}

export function canUseFenixInstitutional(user: RbacUser | null | undefined) {
  return hasAnyRole(user, ["INSTITUTIONAL_ADMIN", "ADMIN", "SUPER_ADMIN"]);
}

export function canUseAuraPro(user: RbacUser | null | undefined) {
  return hasAnyRole(user, medicalRoles);
}

export function canAccessApiClient(user: RbacUser | null | undefined) {
  return hasAnyRole(user, ["INSTITUTIONAL_ADMIN", "ADMIN", "SUPER_ADMIN"]);
}

export function canViewMissingPersonSensitiveData(user: RbacUser | null | undefined) {
  return hasAnyRole(user, commandRoles);
}
