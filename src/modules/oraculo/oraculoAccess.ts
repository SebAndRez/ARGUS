import { getModuleById } from "@/data/argusModules";
import { canAccessModule, mapSessionUserToArgusRole } from "@/lib/modules/moduleAccess";
import type { SessionUser } from "@/types/crisis";
import type { ArgusRole } from "@/types/rbac";
import type { OraculoFeature } from "@/modules/oraculo/types";

export const ORACULO_MODULE_ID = "argus-oraculo";

const fullPanelRoles: ArgusRole[] = ["ANALYST", "OPERATOR", "INSTITUTIONAL_ADMIN", "ADMIN", "SUPER_ADMIN"];
const manageSourcesRoles: ArgusRole[] = ["ADMIN", "SUPER_ADMIN"];

/**
 * ORÁCULO reutiliza el registro y motor de acceso comunes de módulos ARGUS.
 * "argus-oraculo" ya está marcado como `visibility: authenticated` con
 * `allowedRoles` = analista/operador de emergencia/institucional/admin/
 * superadmin. Un usuario con rol POLICE no ve el panel completo salvo que
 * también tenga permiso institucional o superior (ADMIN/SUPER_ADMIN) — igual
 * que en ATLAS.
 */
export function getOraculoModule() {
  const oraculoModule = getModuleById(ORACULO_MODULE_ID);
  if (!oraculoModule) {
    throw new Error("ARGUS ORÁCULO module definition is missing from the registry.");
  }
  return oraculoModule;
}

export function resolveOraculoRole(user: SessionUser | null | undefined): ArgusRole {
  return mapSessionUserToArgusRole(user);
}

export function resolveOraculoModuleAccess(userRole: ArgusRole) {
  return canAccessModule(userRole, getOraculoModule());
}

export function canUseOraculoFeature(user: SessionUser | null | undefined, feature: OraculoFeature): boolean {
  const role = mapSessionUserToArgusRole(user);
  const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";

  switch (feature) {
    case "view_dashboard":
    case "view_sources":
    case "view_evidence":
    case "view_contradictions":
    case "export_trace":
      return isAdmin || fullPanelRoles.includes(role);
    case "verify_evidence":
    case "reject_evidence":
    case "send_to_talos":
    case "send_to_atlas":
      return isAdmin || fullPanelRoles.includes(role);
    case "manage_sources":
      return isAdmin || manageSourcesRoles.includes(role);
    case "view_sensitive_internal_notes":
      return isAdmin || fullPanelRoles.includes(role);
    default:
      return false;
  }
}

/**
 * Resultado simplificado para usuarios sin acceso al panel completo
 * (público/verificado/médico/logística/policía sin permiso adicional): solo
 * ven una etiqueta derivada, nunca el panel analítico.
 */
export type OraculoPublicLabel = "fuente_confiable" | "pendiente_confirmacion" | "evidencia_insuficiente";

export function toOraculoPublicLabel(confidence: "unknown" | "low" | "medium" | "high" | "verified"): OraculoPublicLabel {
  if (confidence === "verified" || confidence === "high") return "fuente_confiable";
  if (confidence === "medium") return "pendiente_confirmacion";
  return "evidencia_insuficiente";
}

export const oraculoPublicLabelText: Record<OraculoPublicLabel, string> = {
  fuente_confiable: "Fuente confiable",
  pendiente_confirmacion: "Pendiente de confirmación",
  evidencia_insuficiente: "Evidencia insuficiente",
};
