import type { ArcaConfidence, ArcaOperationalEvaluation, ArcaShelter, ArcaShelterStatus } from "@/modules/arca/types";
import { calculateArcaCapacityStatus } from "@/modules/arca/arcaCapacity";

const STALE_HOURS = 12;

/**
 * Evaluación de estado operativo. Agua y baños son servicios críticos;
 * energía es importante pero no siempre bloqueante; punto médico mejora la
 * evaluación; necesidades críticas bajan el estado; datos antiguos o
 * contradictorios bajan la confianza (no necesariamente el estado).
 */
export function evaluateArcaOperationalStatus(shelter: ArcaShelter): ArcaOperationalEvaluation {
  const warnings: string[] = [];
  const reasons: string[] = [];
  const capacityStatus = calculateArcaCapacityStatus(shelter);

  let serviceScore = 40;
  if (shelter.services.water === "available") {
    serviceScore += 15;
    reasons.push("Agua disponible.");
  } else if (shelter.services.water === "unavailable") {
    serviceScore -= 20;
    warnings.push("Sin agua disponible: servicio crítico.");
  }

  if (shelter.services.bathrooms === "available") {
    serviceScore += 15;
    reasons.push("Baños disponibles.");
  } else if (shelter.services.bathrooms === "unavailable") {
    serviceScore -= 20;
    warnings.push("Sin baños disponibles: servicio crítico.");
  }

  if (shelter.services.electricity === "available") {
    serviceScore += 8;
    reasons.push("Energía disponible.");
  } else if (shelter.services.electricity === "unavailable") {
    serviceScore -= 5;
  }

  if (shelter.services.medicalPoint === "available") {
    serviceScore += 10;
    reasons.push("Cuenta con punto médico.");
  }

  if (shelter.services.food === "available") {
    serviceScore += 8;
    reasons.push("Alimentación disponible.");
  } else if (shelter.services.food === "unavailable") {
    serviceScore -= 10;
  }

  const criticalNeeds = shelter.needs.filter((need) => need.priority === "critical" && need.status === "open");
  if (criticalNeeds.length > 0) {
    serviceScore -= criticalNeeds.length * 10;
    warnings.push(`${criticalNeeds.length} necesidad(es) crítica(s) sin resolver.`);
  }

  serviceScore = Math.max(0, Math.min(100, Math.round(serviceScore)));

  let status: ArcaShelterStatus = shelter.status;
  if (status !== "closed") {
    if (capacityStatus === "over_capacity") status = "over_capacity";
    else if (capacityStatus === "full") status = "full";
    else if (criticalNeeds.length > 0 || capacityStatus === "near_full") status = "limited";
    else if (shelter.status !== "standby") status = "active";
  }

  const ageHours = (Date.now() - new Date(shelter.updatedAt).getTime()) / 3_600_000;
  let confidence: ArcaConfidence = shelter.confidence;
  if (ageHours > STALE_HOURS) {
    warnings.push("Datos con más de 12 horas de antigüedad.");
    confidence = confidence === "verified" ? "high" : confidence === "high" ? "medium" : confidence;
  }

  return { status, capacityStatus, serviceScore, confidence, warnings, reasons };
}
