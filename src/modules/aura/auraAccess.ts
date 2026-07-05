import type { SessionUser } from "@/types/crisis";
import type { ArgusRole } from "@/types/rbac";
import { mapSessionUserToArgusRole } from "@/lib/modules/moduleAccess";
import type { AuraFeature } from "@/modules/aura/types";

const publicRoles: ArgusRole[] = ["PUBLIC", "CITIZEN", "VERIFIED_CITIZEN", "TRUSTED_CITIZEN"];
const professionalRoles: ArgusRole[] = ["MEDICAL_OPERATOR", "OPERATOR", "INSTITUTIONAL_ADMIN", "ADMIN", "SUPER_ADMIN"];
const aggregateRoles: ArgusRole[] = ["ANALYST", "LOGISTICS", ...professionalRoles];

export function resolveAuraRole(user?: SessionUser | null): ArgusRole {
  return mapSessionUserToArgusRole(user);
}

export function canUseAuraFeature(userOrRole: SessionUser | ArgusRole | null | undefined, feature: AuraFeature) {
  const role = typeof userOrRole === "string" ? userOrRole : resolveAuraRole(userOrRole);

  if (["view_public_aura", "view_own_medical_profile", "view_nearby_medical_points", "create_medical_report"].includes(feature)) {
    return [...publicRoles, ...aggregateRoles].includes(role);
  }
  if (["edit_own_medical_profile", "share_emergency_summary"].includes(feature)) {
    return role !== "PUBLIC";
  }
  if (["view_professional_dashboard", "view_triage_queue", "manage_triage_case", "view_medical_capacity", "update_medical_capacity", "request_medical_transport", "send_to_hermes", "send_to_atlas"].includes(feature)) {
    return professionalRoles.includes(role);
  }
  if (["view_medical_stock", "update_medical_stock", "send_to_nexus"].includes(feature)) {
    return ["MEDICAL_OPERATOR", "OPERATOR", "INSTITUTIONAL_ADMIN", "ADMIN", "SUPER_ADMIN"].includes(role);
  }
  if (feature === "view_sensitive_medical_data" || feature === "export_medical_summary") {
    return ["MEDICAL_OPERATOR", "ADMIN", "SUPER_ADMIN"].includes(role);
  }
  return false;
}

export function resolveAuraModuleAccess(role: ArgusRole) {
  if (publicRoles.includes(role) || aggregateRoles.includes(role)) return { canView: true, canEnter: true };
  return { canView: true, canEnter: false, reason: "AURA requiere un rol valido para operar." };
}
