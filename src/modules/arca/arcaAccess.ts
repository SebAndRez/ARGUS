import { getModuleById } from "@/data/argusModules";
import { canAccessModule, mapSessionUserToArgusRole } from "@/lib/modules/moduleAccess";
import type { SessionUser } from "@/types/crisis";
import type { ArgusRole } from "@/types/rbac";
import type { ArcaFeature } from "@/modules/arca/types";

export const ARCA_MODULE_ID = "argus-arca";

const institutionalRoles: ArgusRole[] = [
  "ANALYST",
  "OPERATOR",
  "LOGISTICS",
  "MEDICAL_OPERATOR",
  "INSTITUTIONAL_ADMIN",
  "ADMIN",
  "SUPER_ADMIN",
];
const logisticsRoles: ArgusRole[] = ["LOGISTICS", "OPERATOR", "INSTITUTIONAL_ADMIN", "ADMIN", "SUPER_ADMIN"];
const manageRoles: ArgusRole[] = ["OPERATOR", "INSTITUTIONAL_ADMIN", "ADMIN", "SUPER_ADMIN"];

/**
 * ARCA reutiliza el registro y motor de acceso comunes de módulos ARGUS.
 * "argus-arca" ya está marcado como público (refugios básicos visibles a
 * todos), con capa institucional avanzada para analista/operador de
 * emergencia/logística/médico/institucional/admin/superadmin. `police` solo
 * ve capas operativas avanzadas si además tiene rol institucional o
 * superior — nunca por ser policía en sí mismo.
 */
export function getArcaModule() {
  const arcaModule = getModuleById(ARCA_MODULE_ID);
  if (!arcaModule) {
    throw new Error("ARGUS ARCA module definition is missing from the registry.");
  }
  return arcaModule;
}

export function resolveArcaRole(user: SessionUser | null | undefined): ArgusRole {
  return mapSessionUserToArgusRole(user);
}

export function resolveArcaModuleAccess(userRole: ArgusRole) {
  return canAccessModule(userRole, getArcaModule());
}

export function canUseArcaFeature(user: SessionUser | null | undefined, feature: ArcaFeature): boolean {
  const role = mapSessionUserToArgusRole(user);
  const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";
  const isVerified = role !== "PUBLIC";

  switch (feature) {
    case "view_public_shelters":
      return true;
    case "view_nearby_shelters":
    case "view_capacity_public":
      return isVerified || role === "PUBLIC";
    case "view_detailed_capacity":
      return isAdmin || institutionalRoles.includes(role);
    case "view_needs":
      return isAdmin || logisticsRoles.includes(role) || institutionalRoles.includes(role);
    case "view_internal_notes":
      return isAdmin || institutionalRoles.includes(role);
    case "manage_shelter_status":
    case "update_capacity":
    case "update_services":
    case "create_shelter":
      return isAdmin || manageRoles.includes(role);
    case "send_to_hermes":
    case "send_to_nexus":
    case "send_to_atlas":
    case "export_shelter_report":
      return isAdmin || institutionalRoles.includes(role);
    default:
      return false;
  }
}
