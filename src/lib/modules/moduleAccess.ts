import type { ArgusModuleDefinition, ModuleAccessResult } from "@/types/argusModule";
import type { ArgusRole } from "@/types/rbac";
import type { SessionUser } from "@/types/crisis";
import { argusModules } from "@/data/argusModules";

/**
 * Roles con privilegio de administrador: siempre pueden entrar a un módulo,
 * incluso si no aparecen explícitamente en `allowedRoles` (evita tener que
 * repetir ADMIN/SUPER_ADMIN en cada definición de módulo).
 */
/** localStorage key used by the `/modules` role switcher to preview visibility. */
export const DEMO_ROLE_STORAGE_KEY = "argus-demo-module-role";

function hasAdminOverride(role: ArgusRole) {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

/**
 * Traduce el `UserRole` real de sesión (`SessionUser`, más limitado: solo
 * CITIZEN/RESPONDER/OPERATOR/ANALYST/ADMIN) al taxonomía `ArgusRole` más
 * fina que usan los módulos. Roles institucionales/médicos/policiales/
 * logísticos todavía no existen en el modelo de usuario real: cuando se
 * conecten, esta función es el único punto que hay que actualizar.
 */
export function mapSessionUserToArgusRole(
  user: SessionUser | null | undefined
): ArgusRole {
  if (!user) return "PUBLIC";
  if (user.accountStatus === "BANNED" || user.accountStatus === "SUSPENDED") {
    return "PUBLIC";
  }

  switch (user.role) {
    case "ADMIN":
      return "ADMIN";
    case "ANALYST":
      return "ANALYST";
    case "OPERATOR":
    case "RESPONDER":
      return "OPERATOR";
    case "CITIZEN":
    default:
      return user.emailVerified || user.governmentIdPresent
        ? "VERIFIED_CITIZEN"
        : "CITIZEN";
  }
}

/**
 * Regla central de acceso a módulos ARGUS.
 *
 * 1. Público -> visible y utilizable para cualquiera.
 * 2. Autenticado -> visible para todos, pero requiere sesión para entrar.
 * 3. Institucional -> visible para todos como resumen comercial ("teaser"),
 *    pero solo entran los roles autorizados (o admin/superadmin).
 * 4. Pago -> si no autorizado, el motivo de bloqueo indica plan institucional.
 * 5. Restringido / oculto -> invisible por completo salvo rol autorizado.
 * 6. `police_only` -> solo POLICE/AUTHORITY/ADMIN/SUPER_ADMIN.
 * 7. `requiresAudit` -> queda declarado en la metadata para que
 *    `auditModuleAccess` registre el intento (no bloquea por sí solo).
 * 8. `requiresOperationalReason` -> el llamador (ModuleAccessGate) debe pedir
 *    un motivo antes de mostrar el contenido; esta función solo expone el
 *    flag a través de `module.requiresOperationalReason`.
 */
export function canAccessModule(
  userRole: ArgusRole,
  module: ArgusModuleDefinition
): ModuleAccessResult {
  const isAdmin = hasAdminOverride(userRole);
  const isPolice = userRole === "POLICE" || userRole === "AUTHORITY";
  const explicitlyAllowed = module.allowedRoles.includes(userRole);
  const roleAllowed = isAdmin || explicitlyAllowed;

  if (module.visibility === "hidden" || module.visibility === "restricted") {
    if (module.accessType === "police_only" && !isPolice && !isAdmin) {
      return {
        canView: false,
        canEnter: false,
        reason: "Acceso reservado a autoridades policiales autorizadas.",
      };
    }
    if (!roleAllowed) {
      return {
        canView: false,
        canEnter: false,
        reason: "No autorizado para este módulo.",
      };
    }
    return { canView: true, canEnter: true };
  }

  if (module.visibility === "public") {
    return { canView: true, canEnter: true };
  }

  if (module.visibility === "authenticated") {
    if (userRole === "PUBLIC") {
      return {
        canView: true,
        canEnter: false,
        reason: "Debe iniciar sesión para usar este módulo.",
      };
    }
    if (!roleAllowed) {
      return {
        canView: true,
        canEnter: false,
        reason: "Este módulo requiere un perfil analista o institucional.",
      };
    }
    return { canView: true, canEnter: true };
  }

  if (module.visibility === "institutional") {
    if (!roleAllowed) {
      return {
        canView: true,
        canEnter: false,
        reason: module.isPaid
          ? "Requiere plan institucional."
          : "Requiere rol institucional autorizado.",
      };
    }
    return { canView: true, canEnter: true };
  }

  return { canView: false, canEnter: false, reason: "Módulo no disponible." };
}

export function getVisibleModules(userRole: ArgusRole) {
  return argusModules
    .filter((module) => canAccessModule(userRole, module).canView)
    .sort((a, b) => a.menuOrder - b.menuOrder);
}

export interface ModuleAuditPayload {
  moduleId: string;
  userRole: string;
  action: string;
  reason?: string;
  timestamp?: string;
}

function shouldLogModuleAudit() {
  return process.env.NODE_ENV !== "production";
}

/**
 * Placeholder de auditoría para módulos sensibles (CUSTOS, ORÁCULO avanzado,
 * TALOS institucional, NEXUS, ATLAS institucional, FÉNIX). Por ahora solo
 * registra en consola; cuando exista un endpoint dedicado, este es el único
 * punto que debe cambiar para llamar a `src/services/auditService.ts`
 * (`logAuditEvent`) o a `POST /api/audit/logs`, sin tocar los componentes
 * que ya invocan `auditModuleAccess`.
 */
export function auditModuleAccess(payload: ModuleAuditPayload) {
  const entry = {
    ...payload,
    timestamp: payload.timestamp ?? new Date().toISOString(),
  };
  if (!shouldLogModuleAudit()) return entry;
  console.info("[ARGUS module audit]", entry);
  return entry;
}

export function isModuleSensitive(module: ArgusModuleDefinition) {
  return module.requiresAudit || module.isRestricted;
}
