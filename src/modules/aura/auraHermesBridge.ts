import type { AuraMedicalPoint, AuraMedicalUrgency } from "@/modules/aura/types";

export function prepareAuraMedicalRouteRequest(origin: { lat: number; lng: number; label?: string }, medicalPoint: AuraMedicalPoint, context: { urgency?: AuraMedicalUrgency; requiresAmbulance?: boolean } = {}) {
  return {
    origin: { ...origin, isApproximate: true },
    destination: medicalPoint.location,
    urgency: context.urgency ?? "medium",
    mobilityMode: context.requiresAmbulance ? "ambulance" : "car",
    requiresAmbulance: Boolean(context.requiresAmbulance),
    priority: context.urgency === "critical" ? "critical" : "standard",
    restrictions: ["No incluye ficha medica personal", "Ruta pendiente de confirmacion HERMES"],
  };
}

export function getAuraHermesRouteSummary(routes: Array<{ status?: string; etaMinutes?: number; warnings?: string[] }>) {
  const route = routes[0];
  return {
    routeAvailable: route?.status === "available",
    routeWithCaution: route?.status === "caution",
    routeBlocked: route?.status === "blocked",
    etaMinutes: route?.etaMinutes,
    warnings: route?.warnings ?? ["Ruta medica pendiente de calculo HERMES."],
  };
}
