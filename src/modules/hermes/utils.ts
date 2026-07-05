import type { HermesMobilityMode, HermesRouteConfidence, HermesRoutePurpose, HermesRouteStatus } from "@/modules/hermes/types";

export const hermesRouteStatusLabel: Record<HermesRouteStatus, string> = {
  available: "Disponible",
  caution: "Precaución",
  high_risk: "Riesgo alto",
  blocked: "Bloqueada",
  unknown: "Desconocida",
  restricted: "Restringida",
};

export const hermesRouteStatusTone: Record<HermesRouteStatus, string> = {
  available: "border-emerald-300/30 bg-emerald-400/10 text-emerald-100",
  caution: "border-amber-300/30 bg-amber-400/10 text-amber-100",
  high_risk: "border-orange-400/35 bg-orange-500/12 text-orange-100",
  blocked: "border-red-400/40 bg-red-500/12 text-red-100",
  unknown: "border-white/15 bg-white/[0.03] text-slate-400",
  restricted: "border-fuchsia-300/30 bg-fuchsia-400/10 text-fuchsia-100",
};

export const hermesConfidenceLabel: Record<HermesRouteConfidence, string> = {
  unknown: "Desconocida",
  low: "Baja",
  medium: "Media",
  high: "Alta",
  verified: "Verificada",
};

export const hermesMobilityModeLabel: Record<HermesMobilityMode, string> = {
  walking: "Caminando",
  car: "Auto",
  motorcycle: "Moto",
  bicycle: "Bicicleta",
  ambulance: "Ambulancia",
  fire_truck: "Camión de bomberos",
  police_vehicle: "Vehículo policial",
  logistics_truck: "Camión logístico",
  bus: "Bus",
  four_by_four: "4x4",
  drone_future: "Dron (futuro)",
  boat_future: "Embarcación (futuro)",
};

export const hermesPurposeLabel: Record<HermesRoutePurpose, string> = {
  safe_navigation: "Navegación segura",
  evacuation: "Evacuación",
  medical_access: "Acceso médico",
  shelter_access: "Acceso a refugio",
  logistics_delivery: "Entrega logística",
  emergency_response: "Respuesta de emergencia",
  area_avoidance: "Evitar zona",
  reconnaissance: "Reconocimiento",
};

export function formatHermesDistance(meters: number | undefined): string {
  if (!meters) return "Distancia N/D";
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

export function formatHermesDuration(seconds: number | undefined): string {
  if (!seconds) return "Duración N/D";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} h ${rest} min`;
}

export function formatHermesRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "Sin registro";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Sin registro";
  const diffMin = Math.round((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return "Recién actualizado";
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHrs = Math.round(diffMin / 60);
  if (diffHrs < 24) return `Hace ${diffHrs} h`;
  return `Hace ${Math.round(diffHrs / 24)} d`;
}
