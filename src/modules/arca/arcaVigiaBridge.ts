import type { VigiaReport } from "@/modules/vigia/types";
import type { ArcaConfidence } from "@/modules/arca/types";

export type ArcaVigiaSignalType =
  | "shelter_full"
  | "water_shortage"
  | "food_shortage"
  | "sanitation_issue"
  | "access_blocked"
  | "safety_concern"
  | "medical_need"
  | "shelter_closed"
  | "unregistered_active_shelter";

export interface ArcaVigiaSignal {
  id: string;
  type: ArcaVigiaSignalType;
  confidence: ArcaConfidence;
  summary: string;
  location?: { lat: number; lng: number; label?: string };
  createdAt: string;
}

const KEYWORD_TYPE_MAP: Array<{ keywords: string[]; type: ArcaVigiaSignalType }> = [
  { keywords: ["lleno", "saturado", "sin cupo"], type: "shelter_full" },
  { keywords: ["sin agua", "falta agua"], type: "water_shortage" },
  { keywords: ["sin comida", "falta comida", "sin alimento"], type: "food_shortage" },
  { keywords: ["baño", "sanitari"], type: "sanitation_issue" },
  { keywords: ["acceso bloqueado", "no se puede entrar", "camino cortado"], type: "access_blocked" },
  { keywords: ["inseguridad", "violencia", "pelea"], type: "safety_concern" },
  { keywords: ["médic", "medic", "atención médica"], type: "medical_need" },
  { keywords: ["cerrado", "cerró"], type: "shelter_closed" },
  { keywords: ["refugio no registrado", "refugio improvisado", "punto no oficial"], type: "unregistered_active_shelter" },
];

function detectSignalType(text: string): ArcaVigiaSignalType | null {
  const normalized = text.toLowerCase();
  const match = KEYWORD_TYPE_MAP.find((entry) => entry.keywords.some((keyword) => normalized.includes(keyword)));
  return match?.type ?? null;
}

/**
 * Convierte reportes VIGÍA relacionados con refugios (lleno, falta de agua/
 * comida, problemas sanitarios, acceso bloqueado, inseguridad, necesidad
 * médica, cerrado, refugio activo no registrado) en señales ARCA. No expone
 * datos personales de reportantes — solo alias público ya visible en VIGÍA.
 * Reglas:
 * - confirmados suben confianza; pendientes generan advertencia;
 * - rechazados no afectan; duplicados se agrupan.
 */
export function convertVigiaReportsToArcaSignals(reports: VigiaReport[]): ArcaVigiaSignal[] {
  const relevant = reports.filter((report) => report.status !== "rejected" && report.status !== "duplicate");
  const seen = new Set<string>();

  return relevant.reduce<ArcaVigiaSignal[]>((signals, report) => {
      const type = detectSignalType(`${report.title} ${report.description}`);
      if (!type) return signals;

      const dedupeKey = `${type}-${report.location.lat.toFixed(2)}-${report.location.lng.toFixed(2)}`;
      if (seen.has(dedupeKey)) return signals;
      seen.add(dedupeKey);

      let confidence: ArcaConfidence = "low";
      if (report.status === "confirmed") confidence = "high";
      else if (report.status === "escalated") confidence = "medium";
      else if (report.status === "under_review" || report.status === "pending_validation") confidence = "low";
      if (report.evidence.length > 0 && confidence === "low") confidence = "medium";

      signals.push({
        id: `arca-vigia-${report.id}`,
        type,
        confidence,
        summary: report.description,
        location: { lat: report.location.lat, lng: report.location.lng, label: report.location.label },
        createdAt: report.createdAt,
      });
      return signals;
    }, []);
}
