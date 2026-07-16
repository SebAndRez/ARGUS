import { NextResponse } from "next/server";
import { getCurrentUser } from "@/services/authService";
import type { ArgusRole } from "@/types/rbac";
import { hasAnyRole } from "@/lib/security/rbac";
import { maskEmail } from "@/lib/security/sanitizers";

export function deny(message = "Acceso denegado.", status = 403) {
  return NextResponse.json({ error: message }, { status });
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) return { user: null, response: deny("Autenticacion requerida.", 401) };
  return { user, response: null };
}

export async function requireRole(roles: ArgusRole[]) {
  const { user, response } = await requireAuth();
  if (response || !user) return { user, response };
  if (!hasAnyRole(user, roles)) return { user, response: deny("Rol no autorizado.", 403) };
  return { user, response: null };
}

/**
 * Named role sets (Prompt 20 cleanup): exported so tests can assert against
 * the real guard's role list directly instead of maintaining a
 * hand-mirrored copy that could silently drift out of sync.
 */
export const VERIFIED_USER_ROLES: ArgusRole[] = ["VERIFIED_CITIZEN", "TRUSTED_CITIZEN", "OPERATOR", "ANALYST", "ADMIN", "SUPER_ADMIN"];
export const OPERATOR_ROLES: ArgusRole[] = ["OPERATOR", "ANALYST", "ADMIN", "SUPER_ADMIN"];
export const ADMIN_ROLES: ArgusRole[] = ["ADMIN", "SUPER_ADMIN"];
export const MEDICAL_ACCESS_ROLES: ArgusRole[] = ["MEDICAL_OPERATOR", "INSTITUTIONAL_ADMIN", "ADMIN", "SUPER_ADMIN"];

export function requireVerifiedUser() {
  return requireRole(VERIFIED_USER_ROLES);
}

export function requireOperator() {
  return requireRole(OPERATOR_ROLES);
}

export function requireAdmin() {
  return requireRole(ADMIN_ROLES);
}

export function requireMedicalAccess() {
  return requireRole(MEDICAL_ACCESS_ROLES);
}

export function sanitizeUserForPublic(user: { id: string; publicAlias: string; role?: string | null }) {
  return {
    id: user.id,
    publicAlias: user.publicAlias,
    role: user.role ?? "CITIZEN",
  };
}

export function sanitizeUserForSelf(user: {
  id: string;
  name: string;
  email: string;
  publicAlias: string;
  role: string;
  accountStatus: string;
  trustScore: number;
  strikes: number;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    publicAlias: user.publicAlias,
    role: user.role,
    accountStatus: user.accountStatus,
    trustScore: user.trustScore,
    strikes: user.strikes,
  };
}

export function sanitizeUserForAdmin(user: {
  id: string;
  name: string;
  email: string;
  publicAlias: string;
  role: string;
  accountStatus: string;
  trustScore: number;
  strikes: number;
}) {
  return {
    ...sanitizeUserForSelf(user),
    emailMasked: maskEmail(user.email),
  };
}
