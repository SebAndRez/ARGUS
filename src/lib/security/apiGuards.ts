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

export function requireVerifiedUser() {
  return requireRole(["VERIFIED_CITIZEN", "TRUSTED_CITIZEN", "OPERATOR", "ANALYST", "ADMIN", "SUPER_ADMIN"]);
}

export function requireOperator() {
  return requireRole(["OPERATOR", "ANALYST", "ADMIN", "SUPER_ADMIN"]);
}

export function requireAdmin() {
  return requireRole(["ADMIN", "SUPER_ADMIN"]);
}

export function requireMedicalAccess() {
  return requireRole(["MEDICAL_OPERATOR", "INSTITUTIONAL_ADMIN", "ADMIN", "SUPER_ADMIN"]);
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
