import type {
  TalosConfidenceLevel,
  TalosEscalationLikelihood,
  TalosEventCategory,
  TalosImpactLevel,
  TalosRiskLevel,
} from "@/modules/talos/types";

export function mapCrisisCategoryToTalosCategory(category: string | null | undefined): TalosEventCategory {
  const normalized = category?.toLowerCase() ?? "";
  if (normalized.includes("incendio") || normalized.includes("fire")) return "fire";
  if (normalized.includes("sismo") || normalized.includes("earthquake")) return "earthquake";
  if (normalized.includes("tsunami")) return "tsunami";
  if (normalized.includes("inunda") || normalized.includes("flood")) return "flood";
  if (normalized.includes("derrumbe") || normalized.includes("landslide")) return "landslide";
  if (normalized.includes("volcan")) return "volcano";
  if (normalized.includes("clima") || normalized.includes("weather")) return "weather";
  if (normalized.includes("infraestructura") || normalized.includes("infrastructure") || normalized.includes("servicios"))
    return "infrastructure";
  if (normalized.includes("medic")) return "medical";
  if (normalized.includes("accidente") || normalized.includes("traffic")) return "traffic";
  if (normalized.includes("seguridad") || normalized.includes("public_disorder")) return "public_security";
  if (normalized.includes("conflict")) return "conflict";
  if (normalized.includes("humanitari")) return "humanitarian";
  return "other";
}

export const talosRiskLevelLabel: Record<TalosRiskLevel, string> = {
  minimal: "Mínimo",
  low: "Bajo",
  medium: "Medio",
  high: "Alto",
  critical: "Crítico",
};

export const talosRiskLevelTone: Record<TalosRiskLevel, string> = {
  minimal: "border-white/15 bg-white/[0.03] text-slate-400",
  low: "border-emerald-300/25 bg-emerald-400/8 text-emerald-100",
  medium: "border-amber-300/30 bg-amber-400/10 text-amber-100",
  high: "border-orange-400/35 bg-orange-500/12 text-orange-100",
  critical: "border-red-400/40 bg-red-500/12 text-red-100",
};

export const talosRiskLevelRank: Record<TalosRiskLevel, number> = {
  minimal: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export const talosConfidenceLabel: Record<TalosConfidenceLevel, string> = {
  unknown: "Desconocida",
  low: "Baja",
  medium: "Media",
  high: "Alta",
  verified: "Verificada",
};

export const talosImpactLabel: Record<TalosImpactLevel, string> = {
  minor: "Menor",
  moderate: "Moderado",
  major: "Mayor",
  severe: "Severo",
  catastrophic: "Catastrófico",
};

export const talosEscalationLabel: Record<TalosEscalationLikelihood, string> = {
  unlikely: "Improbable",
  possible: "Posible",
  likely: "Probable",
  imminent: "Inminente",
  active: "Activo",
};

export function formatTalosRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "Sin registro";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Sin registro";
  const diffMin = Math.round((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return "Recién calculado";
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHrs = Math.round(diffMin / 60);
  if (diffHrs < 24) return `Hace ${diffHrs} h`;
  return `Hace ${Math.round(diffHrs / 24)} d`;
}

/**
 * Calcula `priorityRank` (mayor = más prioritario) para ordenar la cola de
 * TALOS: primero por nivel de riesgo, luego por score, luego por confianza
 * (para desempatar eventos del mismo nivel).
 */
export function computeTalosPriorityRank(riskLevel: TalosRiskLevel, riskScore: number, confidenceScore: number): number {
  return talosRiskLevelRank[riskLevel] * 1000 + riskScore * 10 + confidenceScore;
}
