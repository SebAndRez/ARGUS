import { getModuleById } from "@/data/argusModules";
import { canAccessModule, mapSessionUserToArgusRole } from "@/lib/modules/moduleAccess";
import type { SessionUser } from "@/types/crisis";
import type { ArgusRole } from "@/types/rbac";
import type { TalosFeature } from "@/modules/talos/types";

export const TALOS_MODULE_ID = "argus-talos";

const fullPanelRoles: ArgusRole[] = ["ANALYST", "OPERATOR", "INSTITUTIONAL_ADMIN", "ADMIN", "SUPER_ADMIN"];

/**
 * TALOS reutiliza el registro y motor de acceso comunes de módulos ARGUS.
 * "argus-talos" ya está marcado como público (resultados simples visibles a
 * todos), con `allowedRoles` completos para analista/operador de
 * emergencia/institucional/admin/superadmin. El control fino de qué puede
 * *hacer* cada rol dentro del módulo vive en `canUseTalosFeature`.
 */
export function getTalosModule() {
  const talosModule = getModuleById(TALOS_MODULE_ID);
  if (!talosModule) {
    throw new Error("ARGUS TALOS module definition is missing from the registry.");
  }
  return talosModule;
}

export function resolveTalosRole(user: SessionUser | null | undefined): ArgusRole {
  return mapSessionUserToArgusRole(user);
}

export function resolveTalosModuleAccess(userRole: ArgusRole) {
  return canAccessModule(userRole, getTalosModule());
}

export function canUseTalosFeature(user: SessionUser | null | undefined, feature: TalosFeature): boolean {
  const role = mapSessionUserToArgusRole(user);
  const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";
  const isFullPanel = isAdmin || fullPanelRoles.includes(role);

  switch (feature) {
    case "view_public_summary":
      // Público/verificado: solo resultados simples (nivel de riesgo,
      // sin factores ni fuentes internas).
      return true;
    case "view_dashboard":
    case "view_full_assessment":
    case "view_explanations":
    case "view_source_factors":
      return isFullPanel;
    case "run_assessment":
    case "override_assessment":
    case "send_to_atlas":
    case "send_to_fenix":
    case "export_report":
    case "view_sensitive_context":
      return isAdmin || fullPanelRoles.includes(role);
    default:
      return false;
  }
}
