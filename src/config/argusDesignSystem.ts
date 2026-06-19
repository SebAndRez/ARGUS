import type { EventSeverity, EventType } from "@/types/crisis";

export const VISUAL_SOURCE_CATEGORIES = [
  "governmental_osint",
  "institutional_camera",
  "open_public_camera",
  "commercial_webcam",
  "media_stream",
  "citizen_stream",
  "argus_verified_sensor",
  "unverified_source",
  "unverified",
  "offline",
] as const;

export type VisualSourceCategory = (typeof VISUAL_SOURCE_CATEGORIES)[number];
export type ConfidenceLevel = "high" | "medium" | "low";
export type InterfaceVariant = "citizen" | "operator";
export type LocationPrecision = "exact" | "venue" | "city" | "country" | "unknown";

export interface VisualSourceMetadata {
  name: string;
  sourceCategory: VisualSourceCategory;
  sourceUrl?: string | null;
  embedUrl?: string | null;
  embedAllowed?: boolean;
  locationText?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationPrecision?: LocationPrecision;
  confidence?: number | null;
  lastUpdatedLabel?: string | null;
  weatherSummary?: string | null;
  relatedAlertIds?: string[];
}

export const ALERT_SEVERITY_PRESENTATION: Record<
  EventSeverity,
  { citizenLabel: string; operatorLabel: string; className: string; accentClassName: string }
> = {
  LOW: {
    citizenLabel: "Atención baja",
    operatorLabel: "Severidad baja",
    className: "border-cyan-300/25 bg-cyan-400/10 text-cyan-200",
    accentClassName: "bg-cyan-400",
  },
  MEDIUM: {
    citizenLabel: "Atención media",
    operatorLabel: "Severidad media",
    className: "border-amber-300/25 bg-amber-400/10 text-amber-200",
    accentClassName: "bg-amber-300",
  },
  HIGH: {
    citizenLabel: "Atención alta",
    operatorLabel: "Severidad alta",
    className: "border-orange-300/30 bg-orange-500/10 text-orange-200",
    accentClassName: "bg-orange-400",
  },
  CRITICAL: {
    citizenLabel: "Peligro crítico",
    operatorLabel: "Severidad crítica",
    className: "border-red-300/35 bg-red-500/15 text-red-100",
    accentClassName: "bg-red-500",
  },
};

export const SOURCE_PRESENTATION: Record<
  VisualSourceCategory,
  { citizenLabel: string; operatorLabel: string; iconText: string; className: string }
> = {
  governmental_osint: {
    citizenLabel: "Fuente oficial",
    operatorLabel: "OSINT gubernamental",
    iconText: "GOV",
    className: "border-red-300/35 bg-red-500/10 text-red-100",
  },
  institutional_camera: {
    citizenLabel: "Cámara institucional",
    operatorLabel: "Cámara institucional",
    iconText: "INST",
    className: "border-red-300/35 bg-red-500/10 text-red-100",
  },
  open_public_camera: {
    citizenLabel: "Cámara pública",
    operatorLabel: "Cámara pública abierta",
    iconText: "OPEN",
    className: "border-purple-300/35 bg-purple-500/10 text-purple-100",
  },
  commercial_webcam: {
    citizenLabel: "Webcam pública",
    operatorLabel: "Webcam comercial",
    iconText: "WEB",
    className: "border-purple-300/35 bg-purple-500/10 text-purple-100",
  },
  media_stream: {
    citizenLabel: "Transmisión de prensa",
    operatorLabel: "Stream de medios",
    iconText: "MEDIA",
    className: "border-purple-300/35 bg-purple-500/10 text-purple-100",
  },
  citizen_stream: {
    citizenLabel: "Reporte ciudadano",
    operatorLabel: "Stream ciudadano",
    iconText: "CIV",
    className: "border-amber-300/30 bg-amber-400/10 text-amber-100",
  },
  argus_verified_sensor: {
    citizenLabel: "Verificado por ARGUS",
    operatorLabel: "Sensor ARGUS verificado",
    iconText: "ARG",
    className: "border-cyan-300/35 bg-cyan-400/10 text-cyan-100",
  },
  unverified_source: {
    citizenLabel: "Pendiente de confirmar",
    operatorLabel: "Fuente no verificada",
    iconText: "?",
    className: "border-amber-300/30 bg-amber-400/10 text-amber-100",
  },
  unverified: {
    citizenLabel: "Pendiente de confirmar",
    operatorLabel: "Fuente no verificada",
    iconText: "?",
    className: "border-amber-300/30 bg-amber-400/10 text-amber-100",
  },
  offline: {
    citizenLabel: "Fuente no disponible",
    operatorLabel: "Fuente offline o histórica",
    iconText: "OFF",
    className: "border-slate-400/25 bg-slate-500/10 text-slate-300",
  },
};

export const CONFIDENCE_PRESENTATION: Record<
  ConfidenceLevel,
  { label: string; className: string; indicatorClassName: string }
> = {
  high: {
    label: "Alta",
    className: "border-emerald-300/25 bg-emerald-400/10 text-emerald-200",
    indicatorClassName: "bg-emerald-400",
  },
  medium: {
    label: "Media",
    className: "border-amber-300/25 bg-amber-400/10 text-amber-200",
    indicatorClassName: "bg-amber-300",
  },
  low: {
    label: "Baja",
    className: "border-slate-400/25 bg-slate-500/10 text-slate-300",
    indicatorClassName: "bg-slate-400",
  },
};

export function normalizeSourceCategory(value?: string | null): VisualSourceCategory {
  return VISUAL_SOURCE_CATEGORIES.includes(value as VisualSourceCategory)
    ? (value as VisualSourceCategory)
    : "unverified";
}

export function getConfidenceLevel(score?: number | null, label?: string | null): ConfidenceLevel {
  const normalizedLabel = label?.trim().toLowerCase();
  if (normalizedLabel?.includes("alta") || normalizedLabel === "high") return "high";
  if (normalizedLabel?.includes("media") || normalizedLabel === "medium") return "medium";
  if (normalizedLabel?.includes("baja") || normalizedLabel === "low") return "low";
  if (typeof score !== "number" || !Number.isFinite(score)) return "low";
  if (score >= 80) return "high";
  if (score >= 60) return "medium";
  return "low";
}

export function getDefaultConfidenceLevel({
  type,
  status,
}: {
  type: EventType;
  status?: string | null;
}): ConfidenceLevel {
  const normalizedStatus = status?.trim().toUpperCase();
  if (["VALIDATED", "RESOLVED"].includes(normalizedStatus ?? "")) return "high";
  if (["UNDER_REVIEW", "ASSIGNED", "ESCALATED", "RECEIVED"].includes(normalizedStatus ?? "")) return "medium";
  if (["DISCARDED", "CANCELLED"].includes(normalizedStatus ?? "")) return "low";
  if (type === "SOS") return "medium";
  return "low";
}

export function getDefaultSourceSummary(type: EventType) {
  if (type === "SOS") return "Solicitud de ayuda enviada por un usuario.";
  if (type === "ALERT") return "Alerta operacional pendiente de validación adicional.";
  return "Reporte ciudadano pendiente de contraste con otras fuentes.";
}

export function getDefaultWhyItMatters(severity: EventSeverity, type: EventType) {
  if (type === "SOS") return "Una persona solicitó ayuda y requiere atención prioritaria.";
  if (severity === "CRITICAL") return "Puede existir peligro inmediato para personas cercanas.";
  if (severity === "HIGH") return "La situación puede empeorar o afectar la movilidad del sector.";
  if (severity === "MEDIUM") return "Conviene mantenerse informado y evitar el área si es posible.";
  return "La situación está siendo monitoreada y puede cambiar.";
}

export function getDefaultRecommendedAction({
  severity,
  type,
  status,
  variant = "citizen",
}: {
  severity: EventSeverity;
  type: EventType;
  status?: string | null;
  variant?: InterfaceVariant;
}) {
  if (variant === "operator") {
    if (status === "RESOLVED") return "Confirmar cierre, registrar evidencia y mantener monitoreo preventivo.";
    if (type === "SOS") return "Verificar ubicación, evaluar prioridad y coordinar una unidad de respuesta.";
    if (severity === "CRITICAL") return "Validar con una segunda fuente y escalar a coordinación operacional.";
    return "Contrastar la señal, actualizar su estado y mantener seguimiento geoespacial.";
  }

  if (status === "RESOLVED") return "La situación figura resuelta. Mantente atento a nuevas instrucciones.";
  if (type === "SOS") return "Si estás cerca y es seguro, despeja el acceso. No te expongas al peligro.";
  if (severity === "CRITICAL") return "Aléjate del área y sigue instrucciones oficiales. Usa SOS si estás en peligro.";
  if (severity === "HIGH") return "Evita el sector y busca una ruta alternativa mientras se verifica la situación.";
  if (severity === "MEDIUM") return "Mantén distancia, revisa actualizaciones y sigue indicaciones locales.";
  return "Mantente informado. Si observas cambios relevantes, repórtalos sin ponerte en riesgo.";
}
