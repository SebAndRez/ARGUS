import type { CrisisEvent, EventSeverity } from "@/types/crisis";
import type { AtlasIncidentStatus, AtlasSeverity } from "@/modules/atlas/types";

export function toAtlasSeverity(severity: EventSeverity | string | null | undefined): AtlasSeverity {
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

export function toAtlasIncidentStatus(status: string | null | undefined): AtlasIncidentStatus {
  switch (status) {
    case "RESOLVED":
      return "resolved";
    case "VALIDATED":
    case "ESCALATED":
      return "confirmed";
    case "UNDER_REVIEW":
      return "monitoring";
    case "NEW":
    default:
      return "new";
  }
}

export const atlasSeverityRank: Record<AtlasSeverity, number> = {
  critical: 3,
  high: 2,
  medium: 1,
  low: 0,
};

export const atlasSeverityLabel: Record<AtlasSeverity, string> = {
  critical: "Crítico",
  high: "Alto",
  medium: "Medio",
  low: "Bajo",
};

export const atlasSeverityTone: Record<AtlasSeverity, string> = {
  critical: "border-red-400/40 bg-red-500/12 text-red-100",
  high: "border-orange-400/35 bg-orange-500/12 text-orange-100",
  medium: "border-amber-300/30 bg-amber-400/10 text-amber-100",
  low: "border-emerald-300/25 bg-emerald-400/8 text-emerald-100",
};

export function formatAtlasLocation(event: CrisisEvent): string {
  if (event.locationText) return event.locationText;
  if (Number.isFinite(event.latitude) && Number.isFinite(event.longitude)) {
    return `${event.latitude.toFixed(2)}, ${event.longitude.toFixed(2)}`;
  }
  return "Ubicación no confirmada";
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "Sin registro";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Sin registro";

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "Recién actualizado";
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHrs = Math.round(diffMin / 60);
  if (diffHrs < 24) return `Hace ${diffHrs} h`;
  const diffDays = Math.round(diffHrs / 24);
  return `Hace ${diffDays} d`;
}

/**
 * Sugerencia simple de módulos según el tipo de evento dominante. Es una
 * heurística de coordinación, no un motor de decisión: ATLAS solo orquesta,
 * la lógica avanzada (severidad real, rutas, logística) vive en cada módulo.
 */
export function suggestModuleIdsForEvent(
  event: Pick<CrisisEvent, "category" | "type">,
  options: { userCanUseCustos: boolean }
): string[] {
  const category = event.category?.toLowerCase() ?? "";
  const suggestions = new Set<string>();

  if (category.includes("fire") || category.includes("incendio")) {
    ["argus-aura", "argus-hermes", "argus-arca", "argus-nexus", "argus-talos"].forEach((id) =>
      suggestions.add(id)
    );
  }
  if (category.includes("earthquake") || category.includes("sismo") || category.includes("terremoto")) {
    ["argus-fenix", "argus-hermes", "argus-arca", "argus-aura", "argus-talos"].forEach((id) =>
      suggestions.add(id)
    );
  }
  if (event.type === "SOS") {
    suggestions.add("argus-aura");
  }
  if (category.includes("missing") || category.includes("busqueda") || category.includes("búsqueda")) {
    if (options.userCanUseCustos) suggestions.add("argus-custos");
  }

  return Array.from(suggestions);
}

export function detectContradictionSuggestion(contradictionCount: number): string[] {
  if (contradictionCount <= 0) return [];
  return ["argus-oraculo", "argus-vigia"];
}
