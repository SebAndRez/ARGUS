import { getCurrentUser } from "@/services/authService";
import { getModuleById } from "@/data/argusModules";
import { canAccessModule, mapSessionUserToArgusRole } from "@/lib/modules/moduleAccess";
import type { SessionUser } from "@/types/crisis";
import {
  fetchCanonicalModuleIncidentById,
  fetchCanonicalModuleIncidents,
} from "@/lib/modules/canonicalIncidentGateway";
import type {
  ModuleContextResult,
  ModuleIncidentFilters,
  ModuleIncidentPage,
  ModuleIncidentSummary,
  OperationalContextModuleId,
} from "@/types/moduleOperationalContext";

/**
 * ARGUS Prompt 17 §7-§8 — `ModuleOperationalContext`: la capa que decide
 * *permisos* (server-side, nunca confiando en rol de cliente/localStorage/
 * query param, Prompt 17 §18) antes de exponer el `CanonicalIncidentGateway`
 * a cualquiera de los cuatro módulos. Un solo punto de entrada para las
 * rutas `/api/modules/incidents*` — ningún módulo repite esta lógica.
 */

/**
 * `getCurrentUser()` (`src/services/authService.ts`) returns the raw Prisma
 * `User` row (server-side, cookie-derived) — every other call site of
 * `mapSessionUserToArgusRole` in the repo is client-side and already has a
 * `SessionUser`-shaped object from `/api/auth/me`. This is the first
 * server-side caller, so it needs its own minimal adapter rather than
 * reaching for a nonexistent shared one — only the four fields
 * `mapSessionUserToArgusRole` actually reads are populated correctly
 * (`role`, `accountStatus`, `emailVerified` from `emailVerifiedAt`,
 * `governmentIdPresent` from `governmentIdHash`).
 */
function toSessionUserForRoleMapping(user: {
  id: string;
  name: string;
  email: string;
  publicAlias: string;
  role: string;
  accountStatus: string;
  trustScore: number;
  strikes: number;
  emailVerifiedAt: Date | null;
  governmentIdHash: string | null;
} | null): SessionUser | null {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    publicAlias: user.publicAlias,
    role: user.role as SessionUser["role"],
    accountStatus: user.accountStatus as SessionUser["accountStatus"],
    trustScore: user.trustScore,
    strikes: user.strikes,
    emailVerified: Boolean(user.emailVerifiedAt),
    governmentIdPresent: Boolean(user.governmentIdHash),
  };
}

async function resolveModuleOperationalAccess(moduleId: OperationalContextModuleId) {
  const rawUser = await getCurrentUser();
  const user = toSessionUserForRoleMapping(rawUser);
  const role = mapSessionUserToArgusRole(user);
  const moduleDefinition = getModuleById(moduleId);
  if (!moduleDefinition) {
    return { authorized: false as const, role, hasSession: Boolean(user), reason: "Módulo desconocido." };
  }
  const access = canAccessModule(role, moduleDefinition);
  return { authorized: access.canEnter, role, hasSession: Boolean(user), reason: access.reason };
}

function unauthorizedResult(hasSession: boolean, reason: string | undefined): ModuleContextResult<never> {
  return {
    state: "unauthorized",
    error: {
      code: hasSession ? "FORBIDDEN" : "UNAUTHORIZED",
      message: reason ?? "No autorizado para este módulo.",
    },
  };
}

export async function getModuleIncidentListContext(
  moduleId: OperationalContextModuleId,
  filters: ModuleIncidentFilters = {}
): Promise<ModuleContextResult<ModuleIncidentPage>> {
  const access = await resolveModuleOperationalAccess(moduleId);
  if (!access.authorized) return unauthorizedResult(access.hasSession, access.reason);

  const result = await fetchCanonicalModuleIncidents(filters);
  if (!result.ok) return { state: "unavailable", error: result.error };
  if (result.page.summaries.length === 0) return { state: "empty", data: result.page };
  return { state: "available", data: result.page };
}

export async function getModuleIncidentDetailContext(
  moduleId: OperationalContextModuleId,
  incidentId: string
): Promise<ModuleContextResult<ModuleIncidentSummary>> {
  const access = await resolveModuleOperationalAccess(moduleId);
  if (!access.authorized) return unauthorizedResult(access.hasSession, access.reason);

  const result = await fetchCanonicalModuleIncidentById(incidentId);
  if (!result.ok) {
    const state = result.error.code === "INSUFFICIENT_DATA" ? "insufficient_data" : "unavailable";
    return { state, error: result.error };
  }
  return { state: "available", data: result.summary };
}
