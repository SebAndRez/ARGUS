import { getModuleById } from "@/data/argusModules";
import { canAccessModule, mapSessionUserToArgusRole } from "@/lib/modules/moduleAccess";
import type { SessionUser } from "@/types/crisis";
import type { ArgusRole } from "@/types/rbac";
import type { HermesFeature } from "@/modules/hermes/types";

export const HERMES_MODULE_ID = "argus-hermes";

const institutionalRoles: ArgusRole[] = [
  "ANALYST",
  "OPERATOR",
  "LOGISTICS",
  "INSTITUTIONAL_ADMIN",
  "ADMIN",
  "SUPER_ADMIN",
];
const logisticsRoles: ArgusRole[] = ["LOGISTICS", "OPERATOR", "INSTITUTIONAL_ADMIN", "ADMIN", "SUPER_ADMIN"];
const emergencyRoles: ArgusRole[] = ["OPERATOR", "ANALYST", "INSTITUTIONAL_ADMIN", "ADMIN", "SUPER_ADMIN"];
const medicalRoles: ArgusRole[] = ["MEDICAL_OPERATOR", "OPERATOR", "INSTITUTIONAL_ADMIN", "ADMIN", "SUPER_ADMIN"];

/**
 * HERMES reutiliza el registro y motor de acceso comunes de módulos ARGUS.
 * "argus-hermes" ya está marcado como público (rutas básicas visibles a
 * todos), con capa institucional avanzada para analista/operador de
 * emergencia/logística/médico/institucional/admin/superadmin. `police` solo
 * ve capas operativas avanzadas si además tiene rol institucional o
 * superior (ADMIN/SUPER_ADMIN) — nunca por ser policía en sí mismo.
 */
export function getHermesModule() {
  const hermesModule = getModuleById(HERMES_MODULE_ID);
  if (!hermesModule) {
    throw new Error("ARGUS HERMES module definition is missing from the registry.");
  }
  return hermesModule;
}

export function resolveHermesRole(user: SessionUser | null | undefined): ArgusRole {
  return mapSessionUserToArgusRole(user);
}

export function resolveHermesModuleAccess(userRole: ArgusRole) {
  return canAccessModule(userRole, getHermesModule());
}

export function canUseHermesFeature(user: SessionUser | null | undefined, feature: HermesFeature): boolean {
  const role = mapSessionUserToArgusRole(user);
  const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";
  const isVerified = role !== "PUBLIC";

  switch (feature) {
    case "view_public_routes":
    case "view_blockages":
      return true;
    case "plan_basic_route":
      return isVerified;
    case "view_risk_layers":
    case "view_operational_layers":
      return isAdmin || institutionalRoles.includes(role);
    case "plan_evacuation_route":
      return isAdmin || emergencyRoles.includes(role);
    case "plan_medical_route":
      return isAdmin || medicalRoles.includes(role);
    case "plan_logistics_route":
      return isAdmin || logisticsRoles.includes(role);
    case "manage_blockage_status":
    case "export_routes":
    case "send_to_atlas":
    case "send_to_fenix":
      return isAdmin || institutionalRoles.includes(role);
    default:
      return false;
  }
}
