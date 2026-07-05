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
