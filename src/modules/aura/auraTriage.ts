import type { AuraMedicalUrgency, AuraTriageCase } from "@/modules/aura/types";

export function evaluateAuraTriagePriority(caseInput: AuraTriageCase) {
  const reasons: string[] = [`Prioridad operacional ${caseInput.urgency}.`];
  const warnings = ["AURA no diagnostica ni reemplaza a personal medico."];
  const suggestedModuleActions: string[] = [];
  if (caseInput.urgency === "critical") suggestedModuleActions.push("Notificar ATLAS", "Preparar ruta HERMES", "Revisar capacidad AURA");
  if (caseInput.transportRequired) suggestedModuleActions.push("Preparar traslado sanitario");
  if (caseInput.linkedVigiaReportId) suggestedModuleActions.push("Revisar evidencia VIGIA/ORACULO");
  return { urgency: caseInput.urgency as AuraMedicalUrgency, reasons, warnings, requiresTransport: caseInput.transportRequired, suggestedModuleActions };
}
