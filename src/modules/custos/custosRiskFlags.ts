import type { CustosRiskFlag, CustosSearchInput } from "@/modules/custos/types";

export function detectCustosSuspiciousQuery(input: CustosSearchInput, auditHistory: Array<{ query?: string; caseId?: string }> = []): CustosRiskFlag[] {
  const flags: CustosRiskFlag[] = [];
  if (!input.operationalReason.caseId && !input.operationalReason.operationId) flags.push({ id: "missing-case", severity: "medium", type: "missing_case_reference", message: "Consulta sin caso u operacion claramente vinculada.", recommendedAction: "Solicitar referencia operacional antes de ampliar detalle." });
  if (auditHistory.length > 10) flags.push({ id: "high-volume", severity: "high", type: "high_volume_search", message: "Volumen alto de busquedas en corto periodo.", recommendedAction: "Revisar auditoria y limitar exportaciones." });
  if (auditHistory.filter((item) => item.query === input.query).length > 2) flags.push({ id: "repeat-subject", severity: "medium", type: "repeated_subject_search", message: "Busqueda repetida sobre el mismo sujeto.", recommendedAction: "Requerir justificacion adicional." });
  return flags;
}
