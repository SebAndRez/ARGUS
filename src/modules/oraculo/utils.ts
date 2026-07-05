import type {
  OraculoCommercialUseStatus,
  OraculoConfidenceLevel,
  OraculoContradictionStatus,
  OraculoReliabilityTier,
  OraculoSourceStatus,
  OraculoVerificationStatus,
} from "@/modules/oraculo/types";

export const oraculoConfidenceLabel: Record<OraculoConfidenceLevel, string> = {
  unknown: "Desconocida",
  low: "Baja",
  medium: "Media",
  high: "Alta",
  verified: "Verificada",
};

export const oraculoConfidenceTone: Record<OraculoConfidenceLevel, string> = {
  unknown: "border-white/15 bg-white/[0.03] text-slate-400",
  low: "border-red-400/30 bg-red-500/10 text-red-100",
  medium: "border-amber-300/30 bg-amber-400/10 text-amber-100",
  high: "border-cyan-300/25 bg-cyan-400/10 text-cyan-100",
  verified: "border-emerald-300/30 bg-emerald-400/10 text-emerald-100",
};

export const oraculoVerificationLabel: Record<OraculoVerificationStatus, string> = {
  unverified: "Sin verificar",
  pending_review: "Pendiente de revisión",
  partially_verified: "Parcialmente verificada",
  verified: "Verificada",
  rejected: "Rechazada",
};

export const oraculoContradictionStatusLabel: Record<OraculoContradictionStatus, string> = {
  none: "Sin contradicción",
  possible: "Posible contradicción",
  confirmed: "Contradicción confirmada",
  requires_review: "Requiere revisión",
};

export const oraculoSourceStatusLabel: Record<OraculoSourceStatus, string> = {
  active: "Activa",
  inactive: "Inactiva",
  degraded: "Degradada",
  manual_review: "Revisión manual",
  disabled: "Deshabilitada",
  planned: "Planeada",
};

export const oraculoSourceStatusTone: Record<OraculoSourceStatus, string> = {
  active: "border-emerald-300/30 bg-emerald-400/10 text-emerald-100",
  inactive: "border-white/15 bg-white/[0.03] text-slate-400",
  degraded: "border-amber-300/30 bg-amber-400/10 text-amber-100",
  manual_review: "border-orange-400/30 bg-orange-500/10 text-orange-100",
  disabled: "border-red-400/30 bg-red-500/10 text-red-100",
  planned: "border-cyan-300/20 bg-cyan-400/5 text-cyan-200",
};

export const oraculoReliabilityTierLabel: Record<OraculoReliabilityTier, string> = {
  tier_1_official: "Tier 1 · Oficial",
  tier_2_institutional: "Tier 2 · Institucional",
  tier_3_verified_osint: "Tier 3 · OSINT verificado",
  tier_4_media: "Tier 4 · Media",
  tier_5_citizen: "Tier 5 · Ciudadano",
  unknown: "Sin clasificar",
};

export const oraculoCommercialUseLabel: Record<OraculoCommercialUseStatus, string> = {
  allowed: "Permitido",
  restricted: "Restringido",
  requires_review: "Requiere revisión",
  unknown: "Desconocido",
};

export const oraculoCommercialUseTone: Record<OraculoCommercialUseStatus, string> = {
  allowed: "border-emerald-300/25 bg-emerald-400/8 text-emerald-100",
  restricted: "border-red-400/30 bg-red-500/10 text-red-100",
  requires_review: "border-amber-300/30 bg-amber-400/10 text-amber-100",
  unknown: "border-white/15 bg-white/[0.03] text-slate-400",
};

export function formatOraculoRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "Sin registro";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Sin registro";
  const diffMin = Math.round((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return "Recién recolectada";
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHrs = Math.round(diffMin / 60);
  if (diffHrs < 24) return `Hace ${diffHrs} h`;
  return `Hace ${Math.round(diffHrs / 24)} d`;
}

export function formatOraculoTimestamp(iso: string | null | undefined): string {
  if (!iso) return "--:--";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}
