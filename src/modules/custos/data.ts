import type { CustosOperationalReason, CustosPersonSearchResult } from "@/modules/custos/types";

export const custosDemoReason: CustosOperationalReason = {
  id: "custos-reason-demo",
  type: "missing_person",
  caseId: "CASO-DEMO-001",
  description: "Busqueda demo para reunificacion controlada durante emergencia.",
  requestedByUserId: "demo-authority",
  requestedByRole: "POLICE",
  createdAt: "2026-07-05T12:00:00.000Z",
  status: "approved",
};

export const custosDemoResults: CustosPersonSearchResult[] = [
  {
    id: "custos-person-demo-1",
    displayName: "Persona demo A***",
    alias: "Alias protegido",
    approximateAgeRange: "30-40",
    identityHash: "demo_hash_001",
    status: "reported_safe",
    lastKnownContext: { type: "shelter_check_in", label: "Check-in ARCA demo", timestamp: "2026-07-05T10:15:00.000Z", locationLabel: "Refugio aproximado autorizado", locationApproximate: true },
    visibility: "protected",
    allowedActions: ["view_minimal_status", "link_to_case", "request_more_detail"],
    confidence: "high",
    warnings: ["Ubicacion exacta protegida por defecto."],
    auditRequired: true,
  },
  {
    id: "custos-person-demo-2",
    displayName: "Resultado restringido B***",
    approximateAgeRange: "No revelado",
    identityHash: "demo_hash_002",
    status: "medical_attention",
    lastKnownContext: { type: "medical_transfer", label: "Estado sanitario general restringido", timestamp: "2026-07-05T11:25:00.000Z", locationLabel: "Punto medico aproximado", locationApproximate: true },
    visibility: "redacted",
    allowedActions: ["view_minimal_status", "request_human_review"],
    confidence: "medium",
    warnings: ["No se muestran datos medicos clinicos.", "Detalle sensible requiere aprobacion adicional."],
    auditRequired: true,
  },
  {
    id: "custos-person-demo-3",
    displayName: "Persona demo C***",
    status: "needs_help",
    lastKnownContext: { type: "vigia_report", label: "Reporte VIGIA en revision", timestamp: "2026-07-05T09:55:00.000Z", locationLabel: "Zona aproximada", locationApproximate: true },
    visibility: "minimal",
    allowedActions: ["view_minimal_status", "request_human_review", "send_to_atlas"],
    confidence: "low",
    warnings: ["Reporte ciudadano no es prueba definitiva.", "Requiere revision humana."],
    auditRequired: true,
  },
];

export const custosDemoAuditTrail = [
  { id: "audit-demo-1", user: "demo-authority", role: "POLICE", action: "legal_warning_accepted", timestamp: "2026-07-05T12:02:00.000Z", result: "accepted", redacted: true },
  { id: "audit-demo-2", user: "demo-authority", role: "POLICE", action: "search_executed", timestamp: "2026-07-05T12:04:00.000Z", result: "3 resultados demo", redacted: true },
  { id: "audit-demo-3", user: "demo-authority", role: "POLICE", action: "suspicious_query_checked", timestamp: "2026-07-05T12:04:05.000Z", result: "sin bloqueo", redacted: true },
];
