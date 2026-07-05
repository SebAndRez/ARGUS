import type {
  ArcaShelter,
  ArcaShelterSuitabilityContext,
  ArcaShelterSuitabilityResult,
} from "@/modules/arca/types";
import { calculateArcaCapacityStatus, getArcaAvailableCapacity } from "@/modules/arca/arcaCapacity";

function distanceDegrees(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return Math.hypot(a.lat - b.lat, a.lng - b.lng);
}

/**
 * Idoneidad de refugio para un contexto específico. No promete seguridad
 * absoluta — solo pondera cercanía, capacidad, ruta HERMES, servicios,
 * accesibilidad y exposición a riesgo TALOS.
 */
export function scoreArcaShelterSuitability(
  shelter: ArcaShelter,
  context: ArcaShelterSuitabilityContext
): ArcaShelterSuitabilityResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 40;

  if (shelter.status === "closed") {
    return { score: 0, label: "not_recommended", reasons: [], warnings: ["Refugio cerrado."] };
  }

  const capacityStatus = calculateArcaCapacityStatus(shelter);
  const available = getArcaAvailableCapacity(shelter);
  if (capacityStatus === "available" || capacityStatus === "limited") {
    score += 20;
    reasons.push("Capacidad disponible.");
  } else if (capacityStatus === "full" || capacityStatus === "over_capacity") {
    score -= 30;
    warnings.push("Refugio lleno o sobre su capacidad.");
  } else if (capacityStatus === "unknown") {
    warnings.push("Capacidad desconocida; verifique antes de desplazarse.");
  }
  if (available !== null && available > 0) {
    reasons.push(`Cupo disponible estimado: ${available}.`);
  }

  if (context.userLocation) {
    const distance = distanceDegrees(context.userLocation, shelter.location);
    if (distance <= 0.03) {
      score += 15;
      reasons.push("Cercanía a la ubicación actual.");
    } else if (distance > 0.15) {
      score -= 5;
    }
  }

  if (context.hermesRouteAvailable) {
    score += 12;
    reasons.push("Ruta HERMES disponible hacia el refugio.");
  } else if (context.hermesRouteAvailable === false) {
    score -= 15;
    warnings.push("Ruta hacia el refugio posiblemente bloqueada o no evaluada.");
  }

  if (shelter.services.water === "available" && shelter.services.bathrooms === "available") {
    score += 10;
    reasons.push("Servicios básicos (agua y baños) disponibles.");
  } else {
    if (shelter.services.water !== "available") warnings.push("Sin agua confirmada.");
    if (shelter.services.bathrooms !== "available") warnings.push("Sin baños confirmados.");
    score -= 8;
  }

  if (context.needsMedicalSupport) {
    if (shelter.services.medicalPoint === "available") {
      score += 12;
      reasons.push("Cuenta con punto médico.");
    } else {
      score -= 10;
      warnings.push("Sin punto médico y se requiere atención sanitaria.");
    }
  }

  if (context.hasPets) {
    if (shelter.accessibility.petSupport === true) {
      score += 6;
      reasons.push("Permite mascotas.");
    } else if (shelter.accessibility.petSupport === false) {
      score -= 12;
      warnings.push("No permite mascotas.");
    }
  }

  if (context.reducedMobility) {
    if (shelter.accessibility.wheelchairAccessible === true) {
      score += 8;
      reasons.push("Accesible para movilidad reducida.");
    } else if (shelter.accessibility.wheelchairAccessible === false) {
      score -= 15;
      warnings.push("Sin accesibilidad confirmada para movilidad reducida.");
    }
  }

  if (context.familyWithChildren && shelter.services.childFriendlyArea === "available") {
    score += 6;
    reasons.push("Cuenta con área apta para niños.");
  }

  if (context.talosRiskLevelNearby === "critical" || context.talosRiskLevelNearby === "high") {
    score -= 15;
    warnings.push(`Zona cercana con riesgo TALOS ${context.talosRiskLevelNearby}.`);
  }

  const ageHours = (Date.now() - new Date(shelter.updatedAt).getTime()) / 3_600_000;
  if (ageHours > 12) {
    score -= 8;
    warnings.push("Datos del refugio con más de 12 horas de antigüedad.");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const label: ArcaShelterSuitabilityResult["label"] =
    score >= 75 ? "recommended" : score >= 50 ? "usable" : score >= 25 ? "limited" : shelter.confidence === "unknown" ? "unknown" : "not_recommended";

  return { score, label, reasons, warnings };
}
