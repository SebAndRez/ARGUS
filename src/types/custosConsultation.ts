/**
 * ARGUS CUSTOS es un módulo altamente restringido (búsqueda policial/autorizada).
 * Esta estructura solo prepara la forma de una consulta auditada; no implementa
 * búsqueda real ni persistencia. Sirve de contrato para cuando el backend real
 * de CUSTOS se conecte a `src/services/auditService.ts` / `prisma.auditLog`.
 */
export type CustosConsultationResult = "pending" | "completed" | "denied";
export type CustosAuditStatus = "recorded" | "not_recorded";

export interface CustosConsultationDraft {
  reason: string;
  caseType: string;
  operationId: string;
  requestedByUserId: string;
  requestedByRole: string;
  timestamp: string;
  module: "custos";
  action: string;
  result: CustosConsultationResult;
  auditStatus: CustosAuditStatus;
}

export const custosCaseTypes = [
  "Persona desaparecida",
  "Apoyo a emergencia en curso",
  "Verificación de identidad",
  "Orden judicial / requerimiento formal",
  "Otro (especificar motivo)",
] as const;

export type CustosCaseType = (typeof custosCaseTypes)[number];
