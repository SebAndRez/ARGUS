import { custosDemoResults } from "@/modules/custos/data";
import { canUseCustosFeature, getCustosAccessLevel } from "@/modules/custos/custosAccess";
import { auditCustosAction } from "@/modules/custos/custosAudit";
import { validateCustosOperationalReason } from "@/modules/custos/custosOperationalReason";
import { redactCustosResultForAccessLevel } from "@/modules/custos/custosPrivacy";
import type { CustosSearchInput, CustosSearchResponse } from "@/modules/custos/types";

export function performCustosSearch(input: CustosSearchInput): CustosSearchResponse {
  const createdAt = new Date().toISOString();
  const validation = validateCustosOperationalReason(input.operationalReason);
  const authorized = canUseCustosFeature(input.userRole as never, "perform_search");
  const searchId = `custos-search-${Date.now()}`;
  const warnings: string[] = [...validation.warnings];

  if (!authorized || !validation.valid) {
    auditCustosAction({ userId: input.userId, userRole: input.userRole, action: authorized ? "operational_reason_rejected" : "access_denied", operationalReasonId: input.operationalReason.id, searchId, resultCount: 0, redacted: true });
    return { searchId, results: [], redacted: true, requiresApproval: true, warnings: [...warnings, ...validation.errors], createdAt };
  }

  if (input.query.trim().length < 3) warnings.push("Busqueda demasiado amplia; refine los criterios.");
  const level = getCustosAccessLevel(input.userRole as never);
  const results = custosDemoResults.map((result) => redactCustosResultForAccessLevel(result, level));
  const riskSensitive = input.searchType === "emergency_contact" || input.searchType === "medical_transfer_status";
  auditCustosAction({ userId: input.userId, userRole: input.userRole, action: "search_executed", operationalReasonId: input.operationalReason.id, searchId, caseId: input.operationalReason.caseId, resultCount: results.length, redacted: true });
  return { searchId, results, redacted: true, requiresApproval: riskSensitive, warnings, auditId: `audit-${searchId}`, createdAt };
}
