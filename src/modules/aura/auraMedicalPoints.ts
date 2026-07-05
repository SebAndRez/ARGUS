import type { AuraMedicalPoint } from "@/modules/aura/types";
import { calculateAuraMedicalCapacityStatus } from "@/modules/aura/auraCapacity";

type Geo = { lat: number; lng: number };

function distanceKm(a: Geo, b: Geo) {
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function getNearbyAuraMedicalPoints(userLocation: Geo, medicalPoints: AuraMedicalPoint[]) {
  return medicalPoints
    .map((point) => ({ point, distanceKm: distanceKm(userLocation, point.location) }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

export function evaluateAuraMedicalPointAvailability(point: AuraMedicalPoint) {
  const capacityStatus = calculateAuraMedicalCapacityStatus(point);
  const warnings: string[] = [];
  if (point.status === "limited") warnings.push("Capacidad sanitaria limitada.");
  if (point.capacity?.isEstimated) warnings.push("Capacidad estimada; requiere confirmacion institucional.");
  return { status: point.status, capacityStatus, confidence: point.confidence, warnings };
}

export function getBestAuraMedicalPointForContext(points: AuraMedicalPoint[], context: { needsEmergencyCare?: boolean } = {}) {
  return [...points]
    .filter((point) => point.status !== "closed" && calculateAuraMedicalCapacityStatus(point) !== "saturated")
    .sort((a, b) => {
      const emergencyDelta = Number(b.services.emergencyCare === true && context.needsEmergencyCare) - Number(a.services.emergencyCare === true && context.needsEmergencyCare);
      if (emergencyDelta) return emergencyDelta;
      return Number(b.confidence === "verified" || b.confidence === "high") - Number(a.confidence === "verified" || a.confidence === "high");
    })[0] ?? null;
}
