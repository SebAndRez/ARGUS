import type { CrisisEvent, EventSeverity } from "@/types/crisis";
import type {
  VigiaAtlasSummary,
  VigiaConfidence,
  VigiaReport,
  VigiaReportStatus,
  VigiaReportType,
  VigiaSeverity,
} from "@/modules/vigia/types";

export const vigiaSeverityRank: Record<VigiaSeverity, number> = {
  critical: 3,
  high: 2,
  medium: 1,
  low: 0,
};

export const vigiaSeverityLabel: Record<VigiaSeverity, string> = {
  critical: "Crítico",
  high: "Alto",
  medium: "Medio",
  low: "Bajo",
};

export const vigiaSeverityTone: Record<VigiaSeverity, string> = {
  critical: "border-red-400/40 bg-red-500/12 text-red-100",
  high: "border-orange-400/35 bg-orange-500/12 text-orange-100",
  medium: "border-amber-300/30 bg-amber-400/10 text-amber-100",
  low: "border-emerald-300/25 bg-emerald-400/8 text-emerald-100",
};

export const vigiaStatusLabel: Record<VigiaReportStatus, string> = {
  draft: "Borrador",
  submitted: "Enviado",
  pending_validation: "Pendiente de validación",
  under_review: "En revisión",
  confirmed: "Confirmado",
  rejected: "Rechazado",
  duplicate: "Duplicado",
  escalated: "Escalado",
  resolved: "Resuelto",
};

export const vigiaConfidenceLabel: Record<VigiaConfidence, string> = {
  unknown: "Desconocida",
  low: "Baja",
  medium: "Media",
  high: "Alta",
  verified: "Verificada",
};

export const vigiaReportTypeLabel: Record<VigiaReportType, string> = {
  fire: "Incendio",
  smoke: "Humo visible",
  earthquake_damage: "Daño por sismo",
  flood: "Anegamiento / inundación",
  landslide: "Derrumbe",
  road_block: "Corte de ruta",
  traffic_accident: "Accidente vehicular",
  medical_emergency: "Emergencia médica",
  public_disorder: "Alteración de orden público",
  infrastructure_damage: "Daño de infraestructura",
  power_outage: "Corte eléctrico",
  missing_person_context: "Contexto de persona desaparecida",
  animal_risk: "Riesgo con animales",
  other: "Otro",
};

export function toVigiaSeverity(severity: EventSeverity | string | null | undefined): VigiaSeverity {
  switch (severity) {
    case "CRITICAL":
      return "critical";
    case "HIGH":
      return "high";
    case "MEDIUM":
      return "medium";
    case "LOW":
    default:
      return "low";
  }
}

export function toVigiaStatus(status: string | null | undefined): VigiaReportStatus {
  switch (status) {
    case "VALIDATED":
      return "confirmed";
    case "ESCALATED":
      return "escalated";
    case "DISCARDED":
      return "rejected";
    case "RESOLVED":
      return "resolved";
    case "UNDER_REVIEW":
      return "under_review";
    case "NEW":
    default:
      return "pending_validation";
  }
}

function categoryToVigiaType(category: string | null | undefined): VigiaReportType {
  const normalized = category?.toLowerCase() ?? "";
  if (normalized.includes("incendio") || normalized.includes("fire")) return "fire";
  if (normalized.includes("humo") || normalized.includes("smoke")) return "smoke";
  if (normalized.includes("sismo") || normalized.includes("earthquake")) return "earthquake_damage";
  if (normalized.includes("inunda") || normalized.includes("flood") || normalized.includes("anegamiento")) return "flood";
  if (normalized.includes("derrumbe") || normalized.includes("landslide")) return "landslide";
  if (normalized.includes("ruta") || normalized.includes("road")) return "road_block";
  if (normalized.includes("accidente") || normalized.includes("traffic")) return "traffic_accident";
  if (normalized.includes("medic")) return "medical_emergency";
  if (normalized.includes("seguridad") || normalized.includes("disorder")) return "public_disorder";
  if (normalized.includes("infraestructura") || normalized.includes("infrastructure")) return "infrastructure_damage";
  if (normalized.includes("electric") || normalized.includes("power")) return "power_outage";
  if (normalized.includes("missing_person") || normalized.includes("desaparec")) return "missing_person_context";
  if (normalized.includes("animal")) return "animal_risk";
  return "other";
}

/**
 * Convierte un `CrisisEvent` real (tipo REPORT, ya persistido vía
 * `/api/reports`) en un `VigiaReport` para que el feed y la cola de
 * validación de VIGÍA puedan mostrarlo con su propio vocabulario, sin tocar
 * el tipo original ni el backend.
 */
export function crisisEventToVigiaReport(event: CrisisEvent): VigiaReport {
  const isMissingPerson = event.category?.toLowerCase() === "missing_person";
  return {
    id: event.id,
    type: categoryToVigiaType(event.category),
    title: event.title,
    description: event.description,
    severity: toVigiaSeverity(event.severity),
    status: toVigiaStatus(event.status),
    confidence:
      typeof event.confidence === "number"
        ? event.confidence >= 85
          ? "verified"
          : event.confidence >= 60
            ? "high"
            : event.confidence >= 35
              ? "medium"
              : "low"
        : "unknown",
    location: {
      lat: event.latitude,
      lng: event.longitude,
      label: event.locationText ?? undefined,
      isApproximate: isMissingPerson,
    },
    reporter: {
      id: event.author ?? "unknown",
      alias: event.author ?? "Reportante anónimo",
      role: "CITIZEN",
      reputationScore: 0,
      isVerified: false,
    },
    evidence: [],
    createdAt: event.createdAt,
    updatedAt: event.updatedAt ?? event.createdAt,
    source: "citizen",
    linkedEventId: event.id,
    tags: isMissingPerson ? ["missing_person_context"] : undefined,
    isDemo: event.isDemo,
  };
}

export function formatVigiaLocation(location: VigiaReport["location"]): string {
  if (location.label) return location.isApproximate ? `${location.label} (aprox.)` : location.label;
  return `${location.lat.toFixed(3)}, ${location.lng.toFixed(3)}${location.isApproximate ? " (aprox.)" : ""}`;
}

export function formatVigiaRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "Sin registro";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Sin registro";
  const diffMin = Math.round((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return "Recién enviado";
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHrs = Math.round(diffMin / 60);
  if (diffHrs < 24) return `Hace ${diffHrs} h`;
  return `Hace ${Math.round(diffHrs / 24)} d`;
}

/**
 * Sugerencias visuales de integración con otros módulos ARGUS, según el
 * tipo de reporte. Son solo textos/acciones — ninguno de estos módulos se
 * implementa aquí.
 */
export function suggestModulesForVigiaReport(type: VigiaReportType): string[] {
  const suggestions: string[] = [];
  if (type === "medical_emergency") suggestions.push("Revisar con ARGUS AURA");
  if (["road_block", "traffic_accident", "landslide", "flood", "fire"].includes(type)) {
    suggestions.push("Revisar rutas alternativas con ARGUS HERMES");
  }
  if (["fire", "flood", "earthquake_damage", "landslide"].includes(type)) {
    suggestions.push("Revisar refugios cercanos con ARGUS ARCA");
  }
  return suggestions;
}

/**
 * Resumen tipado que ATLAS podrá consumir para su KPI/feed de reportes
 * ciudadanos. VIGÍA solo prepara el dato; no se integra a ATLAS todavía.
 */
export function getVigiaAtlasSummary(reports: VigiaReport[]): VigiaAtlasSummary {
  const activeReports = reports.filter((report) => !["rejected", "resolved"].includes(report.status));
  const recentThreshold = Date.now() - 3 * 60 * 60 * 1000;

  const bySeverity: Record<VigiaSeverity, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  const byType: Partial<Record<VigiaReportType, number>> = {};

  reports.forEach((report) => {
    bySeverity[report.severity] += 1;
    byType[report.type] = (byType[report.type] ?? 0) + 1;
  });

  return {
    total: reports.length,
    pending: reports.filter((report) => ["pending_validation", "under_review", "submitted"].includes(report.status)).length,
    critical: activeReports.filter((report) => report.severity === "critical").length,
    confirmed: reports.filter((report) => report.status === "confirmed").length,
    duplicates: reports.filter((report) => report.status === "duplicate").length,
    withEvidence: reports.filter((report) => report.evidence.length > 0).length,
    recent: reports.filter((report) => new Date(report.createdAt).getTime() >= recentThreshold).length,
    bySeverity,
    byType,
  };
}

export function isReportNearby(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  thresholdDegrees = 0.01
): boolean {
  return Math.abs(a.lat - b.lat) <= thresholdDegrees && Math.abs(a.lng - b.lng) <= thresholdDegrees;
}
