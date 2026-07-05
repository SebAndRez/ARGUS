import type { CustosOperationalReason, CustosValidationResult } from "@/modules/custos/types";

export function validateCustosOperationalReason(reason: CustosOperationalReason): CustosValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!reason.type) errors.push("Debe seleccionar un tipo de motivo operacional.");
  if (!reason.description || reason.description.trim().length < 12) errors.push("La descripcion del motivo debe ser concreta.");
  if (reason.type === "lawful_police_operation" && !reason.caseId && !reason.operationId) errors.push("Operacion policial requiere caseId u operationId.");
  if (reason.type === "court_or_authority_request" && !reason.authorityReference) errors.push("Requerimiento de autoridad requiere referencia.");
  if (reason.status !== "approved" && reason.status !== "submitted") warnings.push("Motivo no persistido en backend seguro; modo demo.");
  return { valid: errors.length === 0, errors, warnings };
}
