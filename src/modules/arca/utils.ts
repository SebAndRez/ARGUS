import type { ArcaCapacityStatus, ArcaConfidence, ArcaShelterStatus, ArcaShelterType } from "@/modules/arca/types";

export const arcaShelterStatusLabel: Record<ArcaShelterStatus, string> = {
  active: "Activo",
  standby: "En espera",
  full: "Lleno",
  over_capacity: "Sobre capacidad",
  limited: "Limitado",
  closed: "Cerrado",
  unknown: "Desconocido",
};

export const arcaShelterStatusTone: Record<ArcaShelterStatus, string> = {
  active: "border-emerald-300/30 bg-emerald-400/10 text-emerald-100",
  standby: "border-cyan-300/25 bg-cyan-400/8 text-cyan-100",
  full: "border-orange-400/35 bg-orange-500/12 text-orange-100",
  over_capacity: "border-red-400/40 bg-red-500/12 text-red-100",
  limited: "border-amber-300/30 bg-amber-400/10 text-amber-100",
  closed: "border-white/15 bg-white/[0.03] text-slate-400",
  unknown: "border-white/15 bg-white/[0.03] text-slate-400",
};

export const arcaCapacityStatusLabel: Record<ArcaCapacityStatus, string> = {
  available: "Disponible",
  limited: "Limitada",
  near_full: "Casi llena",
  full: "Llena",
  over_capacity: "Sobre capacidad",
  unknown: "Desconocida",
};

export const arcaConfidenceLabel: Record<ArcaConfidence, string> = {
  unknown: "Desconocida",
  low: "Baja",
  medium: "Media",
  high: "Alta",
  verified: "Verificada",
};

export const arcaShelterTypeLabel: Record<ArcaShelterType, string> = {
  public_shelter: "Refugio público",
  school: "Escuela habilitada",
  sports_center: "Centro deportivo",
  community_center: "Centro comunitario",
  church: "Iglesia",
  municipal_building: "Edificio municipal",
  medical_shelter: "Refugio con atención médica",
  temporary_camp: "Campamento temporal",
  evacuation_point: "Punto de evacuación",
  safe_zone: "Zona segura",
  other: "Otro",
};

export function formatArcaDistance(shelterLocation: { lat: number; lng: number }, userLocation?: { lat: number; lng: number }): string {
  if (!userLocation) return "Distancia N/D";
  const R = 6371;
  const dLat = ((shelterLocation.lat - userLocation.lat) * Math.PI) / 180;
  const dLng = ((shelterLocation.lng - userLocation.lng) * Math.PI) / 180;
  const lat1 = (userLocation.lat * Math.PI) / 180;
  const lat2 = (shelterLocation.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const km = 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export function formatArcaRelativeTime(iso: string | null | undefined): string {
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
