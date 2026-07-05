import type { ArgusCorrelatedIncident } from "@/types/correlation";
import type {
  ArgusExternalSourceId,
  ArgusNormalizedEvent,
} from "@/types/ingestion";

export type ArgusHypothesisLevel =
  | "preliminary"
  | "strengthened"
  | "high_confidence"
  | "controlled_negative"
  | "informational_context"
  | "insufficient_data";

export type ArgusOperationalHypothesis = {
  level: ArgusHypothesisLevel;
  label: string;
  confidence: number;
  title: string;
  summary: string;
  evidenceBasis: string[];
  missingEvidence: string[];
  caveats: string[];
  recommendedFollowUp: string[];
  sourceIds: string[];
  isAutomatic: true;
};

export type ArgusOperationalHypothesisContext = {
  relatedSources?: ArgusCorrelatedIncident[];
  evidence?: Array<{ sourceId?: string; title?: string; summary?: string }>;
};

const OFFICIAL_SOURCE_IDS = new Set<ArgusExternalSourceId>([
  "usgs_earthquake",
  "usgs-volcano-hans",
  "gdacs",
  "nasa_firms",
  "nasa-eonet",
  "nasa_eonet",
  "nws",
  "noaa_tsunami",
  "noaa-storm-events",
  "noaa-ncei-tsunami",
  "ioc-slsmf",
  "copernicus_glofas",
]);

const CONTEXTUAL_SOURCE_IDS = new Set<ArgusExternalSourceId>([
  "open-meteo",
  "met_norway",
  "noaa-coops" as ArgusExternalSourceId,
  "ioc-slsmf",
  "openfema",
  "openaq",
  "noaa-storm-events",
  "noaa-ncei-tsunami",
  "copernicus_glofas",
  "hdx_hapi",
  "gdelt",
]);

const LEVEL_LABEL: Record<ArgusHypothesisLevel, string> = {
  preliminary: "PRELIMINAR",
  strengthened: "FORTALECIDA",
  high_confidence: "ALTA CONFIANZA",
  controlled_negative: "CONTROLADA",
  informational_context: "INFORMATIVA",
  insufficient_data: "DATOS INSUFICIENTES",
};

function compact<T>(items: Array<T | null | undefined | false>) {
  return items.filter(Boolean) as T[];
}

function unique(items: string[]) {
  return [...new Set(items.filter(Boolean))];
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function sourceName(sourceId?: string, fallback?: string) {
  if (fallback) return fallback;
  if (sourceId === "usgs_earthquake") return "USGS";
  if (sourceId === "gdacs") return "GDACS";
  if (sourceId === "noaa_tsunami") return "NOAA Tsunami";
  if (sourceId === "nasa-eonet" || sourceId === "nasa_eonet") return "NASA EONET";
  if (sourceId === "nasa_firms") return "NASA FIRMS";
  if (sourceId === "nws") return "NOAA/NWS";
  if (sourceId === "open-meteo") return "Open-Meteo";
  if (sourceId === "openaq") return "OpenAQ";
  if (sourceId === "openfema") return "OpenFEMA";
  return sourceId ? sourceId.replace(/[-_]/g, " ").toUpperCase() : "fuente no especificada";
}

function eventPlace(event: ArgusNormalizedEvent) {
  return event.locationName || event.country || "ubicacion no especificada";
}

function hasMinimumEventData(event?: ArgusNormalizedEvent | null) {
  return Boolean(event?.sourceId && event?.category && (event.title || event.description));
}

function isNoaaNoDanger(event: ArgusNormalizedEvent) {
  const haystack = `${event.rawMessageType ?? ""} ${event.title} ${event.description} ${event.whyItMatters ?? ""}`.toLowerCase();
  return (
    event.sourceId === "noaa_tsunami" &&
    (haystack.includes("information") ||
      haystack.includes("information statement") ||
      haystack.includes("no tsunami danger") ||
      haystack.includes("no existe peligro") ||
      haystack.includes("sin peligro de tsunami"))
  );
}

function isNoaaActiveTsunami(event: ArgusNormalizedEvent) {
  if (event.sourceId !== "noaa_tsunami") return false;
  const message = `${event.rawMessageType ?? ""} ${event.title}`.toLowerCase();
  return ["watch", "advisory", "warning"].some((token) => message.includes(token));
}

function isEonet(event: ArgusNormalizedEvent) {
  return event.sourceId === "nasa-eonet" || event.sourceId === "nasa_eonet";
}

function isTropicalCyclone(event: ArgusNormalizedEvent) {
  const text = `${event.sourceName} ${event.title} ${event.description}`.toLowerCase();
  return (
    event.category === "cyclone" ||
    text.includes("nhc") ||
    text.includes("cphc") ||
    text.includes("hurricane") ||
    text.includes("tropical storm")
  );
}

function isContextualOnly(event: ArgusNormalizedEvent) {
  return CONTEXTUAL_SOURCE_IDS.has(event.sourceId) && !["earthquake", "tsunami", "cyclone", "volcano", "wildfire"].includes(event.category);
}

function correlatedOfficialCount(relatedSources: ArgusCorrelatedIncident[]) {
  const sourceIds = relatedSources.flatMap((correlation) => correlation.sourceIds);
  return unique(sourceIds).filter((sourceId) =>
    OFFICIAL_SOURCE_IDS.has(sourceId as ArgusExternalSourceId)
  ).length;
}

function bestCorrelation(relatedSources: ArgusCorrelatedIncident[]) {
  return relatedSources.reduce<ArgusCorrelatedIncident | null>((best, item) => {
    if (!best || item.confidence > best.confidence) return item;
    return best;
  }, null);
}

export function classifyHypothesisLevel(
  event: ArgusNormalizedEvent | null | undefined,
  relatedSources: ArgusCorrelatedIncident[] = [],
  evidence: ArgusOperationalHypothesisContext["evidence"] = []
): ArgusHypothesisLevel {
  if (!hasMinimumEventData(event)) return "insufficient_data";
  if (!event) return "insufficient_data";
  if (isNoaaNoDanger(event)) return "controlled_negative";
  if (isEonet(event) || isContextualOnly(event)) return "informational_context";

  const officialCorrelations = correlatedOfficialCount(relatedSources);
  const evidenceSources = unique(evidence.map((item) => item.sourceId ?? ""));
  const totalRelevantSources = unique([
    event.sourceId,
    ...relatedSources.flatMap((correlation) => correlation.sourceIds),
    ...evidenceSources,
  ]).length;

  if (totalRelevantSources >= 3 && (officialCorrelations >= 2 || relatedSources.some((item) => item.confidence >= 90))) {
    return "high_confidence";
  }

  if (
    officialCorrelations >= 2 ||
    relatedSources.some(
      (correlation) =>
        correlation.confidence >= 70 &&
        correlation.sourceIds.includes(event.sourceId)
    )
  ) {
    return "strengthened";
  }

  if (OFFICIAL_SOURCE_IDS.has(event.sourceId) || isNoaaActiveTsunami(event)) {
    return "preliminary";
  }

  return "informational_context";
}

function seismicIntensityPhrase(event: ArgusNormalizedEvent) {
  const magnitude = event.rawMagnitude ?? 0;
  if (magnitude >= 6.5) return "alta intensidad potencial";
  if (magnitude >= 5) return "intensidad potencial moderada";
  return "baja a moderada intensidad potencial";
}

export function buildHypothesisText(
  event: ArgusNormalizedEvent | null | undefined,
  hypothesisLevel: ArgusHypothesisLevel,
  evidence: ArgusOperationalHypothesisContext["evidence"] = [],
  relatedSources: ArgusCorrelatedIncident[] = []
) {
  if (!event || hypothesisLevel === "insufficient_data") {
    return "ARGUS no cuenta con datos minimos de fuente, tipo, ubicacion o descripcion para elevar una hipotesis operacional concreta.";
  }

  const place = eventPlace(event);
  const correlation = bestCorrelation(relatedSources);
  const contextualEvidenceCount = evidence.length;

  if (hypothesisLevel === "controlled_negative") {
    return `NOAA emitio un boletin informativo por un sismo cerca de ${place} indicando que no existe peligro de tsunami. La hipotesis operativa actual es evento sismico sin amenaza tsunami asociada segun fuente oficial, manteniendo monitoreo por actualizaciones.`;
  }

  if (event.sourceId === "usgs_earthquake" && hypothesisLevel === "strengthened" && correlation) {
    return `USGS y ${correlation.sourceIds.includes("gdacs") ? "GDACS" : "fuentes relacionadas"} probablemente estan reportando el mismo evento sismico cerca de ${place}. La coincidencia espacial y temporal fortalece la hipotesis de un terremoto real${
      typeof event.rawMagnitude === "number" ? ` de magnitud ${event.rawMagnitude.toFixed(1)}` : ""
    }. Con la evidencia actual, ARGUS no detecta confirmacion suficiente de impacto mayor.`;
  }

  if (event.sourceId === "usgs_earthquake" && typeof event.rawMagnitude === "number") {
    return `Evento sismico real detectado por USGS en ${place}. Magnitud ${event.rawMagnitude.toFixed(1)}${
      typeof event.rawDepthKm === "number" ? ` y profundidad ${event.rawDepthKm.toFixed(1)} km` : ""
    } sugieren ${seismicIntensityPhrase(event)} segun contexto ARGUS. Mantener seguimiento por replicas, actualizaciones oficiales o reportes locales.`;
  }

  if (event.sourceId === "gdacs") {
    return `GDACS reporta un evento ${event.category} en ${place}${
      event.rawAlertLevel ? ` con nivel ${event.rawAlertLevel}` : ""
    }. La hipotesis ARGUS es un evento institucionalmente reportado que requiere contraste con fuente tecnica primaria y reportes locales antes de inferir impacto.`;
  }

  if (isNoaaActiveTsunami(event)) {
    return `NOAA emitio ${event.rawMessageType ?? "un aviso"} de tsunami para ${place}. La hipotesis ARGUS es amenaza costera activa bajo evaluacion oficial; revise instrucciones de autoridades locales antes de tomar decisiones criticas.`;
  }

  if (isEonet(event)) {
    return `NASA EONET registra un evento natural global de tipo ${event.category} asociado a ${event.title}. La hipotesis informativa ARGUS es que existe un fenomeno natural activo o reportado, util para conciencia situacional, pero requiere validacion con fuente oficial local o especializada antes de accion critica.`;
  }

  if (isTropicalCyclone(event)) {
    return `${sourceName(event.sourceId, event.sourceName)} reporta ${event.title}. La hipotesis ARGUS es sistema tropical activo con potencial de impacto segun trayectoria e intensidad oficial. Validar watches, warnings y fuentes locales antes de acciones criticas.`;
  }

  if (hypothesisLevel === "high_confidence") {
    return `${sourceName(event.sourceId, event.sourceName)} y fuentes relacionadas sostienen una hipotesis de alta confianza para ${event.category} en ${place}${
      contextualEvidenceCount > 0 ? ` con ${contextualEvidenceCount} evidencia(s) contextual(es)` : ""
    }. ARGUS considera fuerte la coincidencia disponible, sin convertirla en orden oficial ni inferir danos no reportados.`;
  }

  if (hypothesisLevel === "informational_context") {
    return `${sourceName(event.sourceId, event.sourceName)} aporta contexto sobre ${event.category} en ${place}. La hipotesis informativa ARGUS mejora la conciencia situacional, pero no confirma por si sola una emergencia actual ni reemplaza validacion oficial local.`;
  }

  return `${sourceName(event.sourceId, event.sourceName)} reporta un evento ${event.category} en ${place}. La hipotesis preliminar ARGUS es que existe un evento real o institucionalmente registrado, con confianza limitada hasta recibir correlaciones, actualizaciones oficiales o reportes locales.`;
}

export function buildEvidenceBasis(
  event: ArgusNormalizedEvent | null | undefined,
  relatedSources: ArgusCorrelatedIncident[] = [],
  evidence: ArgusOperationalHypothesisContext["evidence"] = []
) {
  if (!event) return [];
  const basis = [
    `Fuente primaria: ${sourceName(event.sourceId, event.sourceName)}.`,
    event.locationName ? `Ubicacion reportada: ${event.locationName}.` : null,
    typeof event.rawMagnitude === "number" ? `Magnitud reportada: ${event.rawMagnitude.toFixed(1)}${event.rawMagnitudeType ? ` ${event.rawMagnitudeType}` : ""}.` : null,
    typeof event.rawDepthKm === "number" ? `Profundidad reportada: ${event.rawDepthKm.toFixed(1)} km.` : null,
    event.rawAlertLevel ? `Nivel de alerta fuente: ${event.rawAlertLevel}.` : null,
    event.rawMessageType ? `Tipo de mensaje fuente: ${event.rawMessageType}.` : null,
    ...relatedSources.slice(0, 3).map((correlation) => {
      const sources = correlation.sourceIds.map((sourceId) => sourceName(sourceId)).join(" + ");
      return `Fuentes relacionadas: ${sources}; correlacion ${correlation.confidence}%.`;
    }),
    ...evidence.slice(0, 3).map((item) => `Contexto: ${item.title ?? item.summary ?? sourceName(item.sourceId)}.`),
  ];
  return unique(compact(basis));
}

export function buildMissingEvidenceText(
  event: ArgusNormalizedEvent | null | undefined,
  hypothesisLevel: ArgusHypothesisLevel
) {
  if (hypothesisLevel === "controlled_negative") {
    return [
      "Cambios en boletin NOAA, watch, advisory o warning.",
      "Confirmacion local de autoridad competente.",
      "Nuevas mediciones costeras o sismicas oficiales.",
    ];
  }

  if (hypothesisLevel === "insufficient_data") {
    return [
      "Fuente primaria identificable.",
      "Tipo de evento y ubicacion minima.",
      "Hora del evento o enlace oficial.",
    ];
  }

  const missing = [
    "Segunda fuente oficial o confiable correlacionada.",
    "Actualizacion de autoridad competente.",
    "Reportes locales o mediciones contextuales.",
  ];

  if (event?.category === "earthquake") {
    missing.push("Reportes de danos, replicas relevantes o intensidad oficial.");
  }
  if (event?.category === "tsunami") {
    missing.push("Geometria oficial, observaciones mareograficas o cambio de boletin.");
  }
  if (event?.category === "cyclone" || event?.category === "storm") {
    missing.push("Trayectoria oficial, watches/warnings y observaciones locales.");
  }

  return missing;
}

export function buildOperationalCaveat(
  event: ArgusNormalizedEvent | null | undefined,
  hypothesisLevel: ArgusHypothesisLevel
) {
  return compact([
    "Estimacion ARGUS: no es una prediccion exacta ni reemplaza informacion oficial ni instrucciones de autoridad competente.",
    "Esta hipotesis se genera automaticamente con la evidencia disponible y puede cambiar con nuevas fuentes.",
    hypothesisLevel === "informational_context"
      ? "La fuente contextual apoya conciencia situacional, pero no confirma por si sola una emergencia actual."
      : null,
    event?.category === "tsunami" || event?.category === "cyclone" || event?.category === "wildfire"
      ? "ARGUS no emite ordenes de evacuacion; revise instrucciones oficiales si existe alerta activa."
      : null,
  ]);
}

export function calculateHypothesisConfidence(
  event: ArgusNormalizedEvent | null | undefined,
  relatedSources: ArgusCorrelatedIncident[] = [],
  evidence: ArgusOperationalHypothesisContext["evidence"] = []
) {
  const level = classifyHypothesisLevel(event, relatedSources, evidence);
  if (!event || level === "insufficient_data") return 25;
  if (level === "controlled_negative") {
    const clarity = isNoaaNoDanger(event) ? 90 : 78;
    return clamp(Math.max(clarity, event.confidence), 75, 95);
  }
  if (level === "informational_context") {
    return clamp(Math.max(45, Math.min(event.confidence, 60)), 35, 60);
  }
  if (level === "high_confidence") {
    return clamp(Math.max(90, bestCorrelation(relatedSources)?.confidence ?? event.confidence), 90, 96);
  }
  if (level === "strengthened") {
    return clamp(Math.max(75, bestCorrelation(relatedSources)?.confidence ?? event.confidence), 75, 90);
  }
  return clamp(Math.max(55, Math.min(event.confidence, 70)), 55, 70);
}

function buildRecommendedFollowUp(event: ArgusNormalizedEvent | null | undefined, level: ArgusHypothesisLevel) {
  if (!event) return ["Completar datos minimos del evento antes de accionar."];
  if (level === "controlled_negative") {
    return ["Mantener monitoreo de boletines NOAA y autoridad local.", "No inferir amenaza tsunami sin nueva alerta oficial."];
  }
  if (level === "informational_context") {
    return ["Validar con autoridad local o fuente tecnica especializada antes de accion critica."];
  }
  return ["Mantener seguimiento de fuentes oficiales.", "Contrastar con reportes locales y mediciones contextuales antes de elevar impacto."];
}

export function generateOperationalHypothesis(
  event: ArgusNormalizedEvent | null | undefined,
  context: ArgusOperationalHypothesisContext = {}
): ArgusOperationalHypothesis {
  const relatedSources = context.relatedSources ?? [];
  const evidence = context.evidence ?? [];
  const level = classifyHypothesisLevel(event, relatedSources, evidence);
  const sourceIds = unique([
    event?.sourceId ?? "",
    ...relatedSources.flatMap((correlation) => correlation.sourceIds),
    ...evidence.map((item) => item.sourceId ?? ""),
  ]);

  return {
    level,
    label: LEVEL_LABEL[level],
    confidence: calculateHypothesisConfidence(event, relatedSources, evidence),
    title: "Hipotesis ARGUS generada automaticamente",
    summary: buildHypothesisText(event, level, evidence, relatedSources),
    evidenceBasis: buildEvidenceBasis(event, relatedSources, evidence),
    missingEvidence: buildMissingEvidenceText(event, level),
    caveats: buildOperationalCaveat(event, level),
    recommendedFollowUp: buildRecommendedFollowUp(event, level),
    sourceIds,
    isAutomatic: true,
  };
}
