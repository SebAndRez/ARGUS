import type {
  ArgusExternalSourceId,
  ArgusIngestionCategory,
  ArgusIngestionSeverity,
  ArgusNormalizedEvent,
} from "@/types/ingestion";

interface NormalizerInput {
  id: string;
  sourceId: ArgusExternalSourceId;
  sourceName: string;
  rawId: string;
  title: string;
  description?: string | null;
  category?: string | null;
  severity?: string | null;
  confidence?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  country?: string | null;
  region?: string | null;
  occurredAt?: string | null;
  updatedAt?: string | null;
  sourceUrl?: string | null;
  isDemo?: boolean;
}

export function normalizeArgusEvent(input: NormalizerInput): ArgusNormalizedEvent {
  return {
    id: input.id,
    sourceId: input.sourceId,
    sourceName: input.sourceName,
    externalId: input.rawId,
    title: input.title || "Evento externo",
    description: input.description ?? "",
    category: normalizeEventCategory(input.category),
    severity: normalizeSeverity(input.severity),
    confidence: clamp(input.confidence ?? (input.isDemo ? 45 : 70), 0, 100),
    latitude: finiteOrNull(input.latitude),
    longitude: finiteOrNull(input.longitude),
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    updatedAt: input.updatedAt ?? null,
    url: input.sourceUrl ?? null,
    country: input.country ?? null,
    locationName: input.region ?? null,
    recommendedAction: input.isDemo
      ? "Dato demo: revise fuentes oficiales antes de actuar."
      : "Revise fuentes oficiales y mantengase atento a actualizaciones.",
    whyItMatters: input.isDemo
      ? "Ayuda a probar la interfaz sin representar un evento real."
      : "Aporta contexto operativo para priorizacion ARGUS.",
    isExternal: true,
  };
}

export function normalizeEventCategory(value: string | null | undefined): ArgusIngestionCategory {
  const lower = String(value ?? "unknown").toLowerCase();
  if (lower.includes("quake")) return "earthquake";
  if (lower.includes("tsunami")) return "tsunami";
  if (lower.includes("fire") || lower.includes("thermal")) return "thermal_anomaly";
  if (lower.includes("weather")) return "weather";
  if (lower.includes("conflict")) return "conflict";
  if (lower.includes("humanitarian")) return "humanitarian_context";
  return "unknown";
}

export function normalizeSeverity(value: string | null | undefined): ArgusIngestionSeverity {
  const lower = String(value ?? "").toLowerCase();
  if (["critical", "red", "severe"].some((item) => lower.includes(item))) return "critical";
  if (["high", "orange", "warning"].some((item) => lower.includes(item))) return "high";
  if (["medium", "green", "watch", "advisory"].some((item) => lower.includes(item))) return "medium";
  return "low";
}

function finiteOrNull(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
