import type { SessionUser } from "@/types/crisis";
import type { ArgusRole } from "@/types/rbac";
import { mapSessionUserToArgusRole } from "@/lib/modules/moduleAccess";
import type { CustosAccessLevel, CustosFeature } from "@/modules/custos/types";

export function resolveCustosRole(user?: SessionUser | null): ArgusRole {
  return mapSessionUserToArgusRole(user);
}

export function getCustosAccessLevel(role: ArgusRole): CustosAccessLevel {
  if (role === "SUPER_ADMIN") return "superadmin";
  if (role === "ADMIN") return "supervised_admin";
  if (role === "AUTHORITY") return "operational_search";
  if (role === "POLICE") return "case_search";
  return "none";
}

export function canUseCustosFeature(userOrRole: SessionUser | ArgusRole | null | undefined, feature: CustosFeature) {
  const role = typeof userOrRole === "string" ? userOrRole : resolveCustosRole(userOrRole);
  const level = getCustosAccessLevel(role);
  if (level === "none") return false;
  if (["view_module", "submit_operational_reason", "perform_search", "view_minimal_result", "request_sensitive_detail", "link_result_to_case", "mark_humanitarian_status", "send_to_atlas"].includes(feature)) return true;
  if (["view_audit_trail", "admin_review", "export_audit_summary", "view_protected_result"].includes(feature)) return ["operational_search", "supervised_admin", "superadmin"].includes(level);
  return false;
}

export function resolveCustosModuleAccess(role: ArgusRole) {
  const level = getCustosAccessLevel(role);
  if (level !== "none") return { canView: true, canEnter: true, level };
  return { canView: false, canEnter: false, level, reason: "CUSTOS esta reservado a policia, autoridad, admin auditado o superadmin." };
}
