import type { AuraTriageCase } from "@/modules/aura/types";

export function prepareAuraMedicalTransportRequest(caseInput: AuraTriageCase) {
  return {
    caseId: caseInput.id,
    origin: caseInput.location ?? { label: "Origen aproximado pendiente" },
    destinationMedicalPointId: caseInput.assignedMedicalPointId,
    urgency: caseInput.urgency,
    requiresAmbulance: caseInput.transportRequired,
    routeStatus: "pending_hermes",
    requestStatus: "draft",
    personalMedicalDataIncluded: false,
  };
}
