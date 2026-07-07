import type { AuraMedicalPoint } from "@/modules/aura/types";
import type { MedicalPoint, MedicalPointAvailability, MedicalPointType } from "@/types/medical";
import { auraDemoMedicalPoints } from "@/modules/aura/data";
import {
  evaluateAuraMedicalPointAvailability,
  getNearbyAuraMedicalPoints,
} from "@/modules/aura/auraMedicalPoints";

/**
 * Unica fuente de puntos medicos de ARGUS. AURA (SOS Medico rapido y
 * dashboard completo) y el mapa operacional consumen este archivo — no debe
 * crearse un segundo dataset medico paralelo. Los datos ricos viven en
 * `AuraMedicalPoint` (`@/modules/aura/types` + `@/modules/aura/data`); este
 * archivo expone una vista simplificada (`MedicalPoint`) para UI/routing.
 */
export const auraMedicalPoints: AuraMedicalPoint[] = auraDemoMedicalPoints;

function toMedicalPointType(type: AuraMedicalPoint["type"]): MedicalPointType {
  switch (type) {
    case "hospital":
      return "hospital";
    case "shelter_medical_point":
      return "shelter_medical";
    case "field_medical_point":
    case "temporary_care_point":
      return "temporary_medical_point";
    default:
      return "clinic";
  }
}

function toAvailabilityStatus(point: AuraMedicalPoint): MedicalPointAvailability {
  if (point.status === "closed") return "closed";
  const { capacityStatus } = evaluateAuraMedicalPointAvailability(point);
  if (capacityStatus === "unknown") return "unknown";
  if (capacityStatus === "saturated" || point.status === "limited") return "limited";
  return "available";
}

const capabilityLabels: Array<[keyof AuraMedicalPoint["services"], string]> = [
  ["emergencyCare", "Urgencia"],
  ["triage", "Triaje"],
  ["traumaCare", "Trauma"],
  ["pediatricCare", "Pediatria"],
  ["ambulance", "Ambulancia"],
  ["pharmacy", "Farmacia"],
  ["oxygen", "Oxigeno"],
  ["defibrillator", "Desfibrilador"],
  ["mentalHealthSupport", "Salud mental"],
  ["firstAid", "Primeros auxilios"],
];

function toCapabilities(point: AuraMedicalPoint): string[] {
  return capabilityLabels
    .filter(([key]) => point.services[key] === true)
    .map(([, label]) => label);
}

export function toMedicalPoint(point: AuraMedicalPoint, distanceKm?: number): MedicalPoint {
  return {
    id: point.id,
    name: point.name,
    type: toMedicalPointType(point.type),
    lat: point.location.lat,
    lng: point.location.lng,
    capabilities: toCapabilities(point),
    distanceKm,
    availabilityStatus: toAvailabilityStatus(point),
    isDemo: true,
  };
}

/** Puntos medicos ordenados por distancia real (haversine) desde `userLocation`. */
export function getNearbyMedicalPoints(
  userLocation: { lat: number; lng: number },
  points: AuraMedicalPoint[] = auraMedicalPoints
): MedicalPoint[] {
  return getNearbyAuraMedicalPoints(userLocation, points).map(({ point, distanceKm }) =>
    toMedicalPoint(point, distanceKm)
  );
}

export function findAuraMedicalPointById(id: string): AuraMedicalPoint | undefined {
  return auraMedicalPoints.find((point) => point.id === id);
}
