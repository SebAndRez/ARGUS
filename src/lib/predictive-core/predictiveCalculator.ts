import {
  calculateConfidenceScore,
  calculateProbabilityScore,
  calculateSeverity,
  calculateUncertainty,
  probabilityLabel,
  shouldNotifyNearbyUser,
  shouldSendToCommandCenter,
  shouldSendToFenix,
} from "@/lib/predictive-core/predictionScoring";
import type {
  ArgusPredictionClassification,
  ArgusPredictionContext,
  ArgusPredictionEvidence,
  ArgusPredictionInput,
  ArgusPredictionResult,
} from "@/types/predictiveCore";

function nowIso() {
  return new Date().toISOString();
}

function statusFor(
  input: ArgusPredictionInput,
  classification: ArgusPredictionClassification,
  probabilityScore: number
): ArgusPredictionResult["status"] {
  if (classification.isOfficialPrimaryEvidence) return "confirmed_by_official_source";
  if (input.kind === "sos" || input.sourceAuthority === "citizen") return probabilityScore >= 55 ? "verifying" : "watch";
  if (probabilityScore >= 70) return "probable";
  if (probabilityScore >= 45) return "possible";
  return "insufficient_data";
}

function primaryMode(
  input: ArgusPredictionInput,
  classification: ArgusPredictionClassification,
  context: ArgusPredictionContext
): ArgusPredictionResult["primaryMode"] {
  if (classification.isOfficialPrimaryEvidence) return "official";
  if (input.sourceAuthority === "citizen" && context.relatedOfficialEvents.length > 0) return "hybrid";
  if (input.sourceAuthority === "citizen") return "citizen";
  return input.sourceAuthority === "system" ? "system" : "hybrid";
}

function buildEvidence(
  input: ArgusPredictionInput,
  classification: ArgusPredictionClassification,
  context: ArgusPredictionContext
): ArgusPredictionEvidence[] {
  const evidence: ArgusPredictionEvidence[] = [
    {
      id: `input-${input.id}`,
      label: classification.isOfficialPrimaryEvidence ? "Evidencia primaria" : "Evidencia de apoyo",
      description: classification.isOfficialPrimaryEvidence
        ? "ARGUS usa esta fuente como evidencia primaria; el contexto histórico no la reemplaza."
        : "Input inicial en verificación; requiere contraste con fuentes oficiales o reportes independientes.",
      level: classification.isOfficialPrimaryEvidence ? "primary" : "supporting",
      sourceName: input.sourceName,
      sourceAuthority: input.sourceAuthority,
      weight: classification.isOfficialPrimaryEvidence ? 0.75 : 0.35,
      observedAt: input.occurredAt ?? input.receivedAt,
      relatedInputId: input.id,
    },
  ];

  if (context.relatedOfficialEvents.length === 0 && !classification.isOfficialPrimaryEvidence) {
    evidence.push({
      id: `no-official-${input.id}`,
      label: "Sin fuente oficial asociada aún",
      description: "No se encontró evidencia primaria cercana en la data existente consultada por ARGUS.",
      level: "derived",
      sourceAuthority: "argus_estimate",
      weight: 0.15,
    });
  }

  context.relatedOfficialEvents.slice(0, 3).forEach((event, index) => {
    evidence.push({
      id: `official-${input.id}-${index}`,
      label: "Fuente oficial relacionada",
      description: String((event as { title?: unknown }).title ?? "Evento oficial relacionado en la zona."),
      level: "primary",
      sourceName: String((event as { sourceId?: unknown }).sourceId ?? "Fuente oficial"),
      sourceAuthority: "official",
      weight: 0.7,
      relatedInputId: String((event as { id?: unknown }).id ?? input.id),
    });
  });

  context.relatedOpenDataEvents.slice(0, 3).forEach((event, index) => {
    evidence.push({
      id: `open-data-${input.id}-${index}`,
      label: "Evidencia de apoyo open data",
      description: String((event as { title?: unknown }).title ?? "Evento open data relacionado."),
      level: "supporting",
      sourceName: String((event as { sourceId?: unknown }).sourceId ?? "Open data"),
      sourceAuthority: "open_data",
      weight: 0.45,
      relatedInputId: String((event as { id?: unknown }).id ?? input.id),
    });
  });

  context.knowledgeFacts.slice(0, 2).forEach((fact, index) => {
    evidence.push({
      id: `knowledge-${input.id}-${index}`,
      label: "Contexto histórico o doctrinal",
      description: String((fact as { summary?: unknown; title?: unknown }).summary ?? (fact as { title?: unknown }).title ?? "Contexto histórico relacionado."),
      level: "historical",
      sourceName: String((fact as { sourceName?: unknown }).sourceName ?? "ARGUS Knowledge"),
      sourceAuthority: "institutional",
      weight: 0.25,
    });
  });

  return evidence;
}

function recommendedActionFor(input: ArgusPredictionInput, classification: ArgusPredictionClassification) {
  if (input.kind === "sos") {
    return "Priorizar atención y validación humana, contrastar ubicación y contexto sin exponer datos personales.";
  }
  if (input.sourceAuthority === "citizen") {
    return "Contrastar con fuentes oficiales, cámaras asociadas o reportes independientes cercanos antes de elevar prioridad.";
  }
  if (input.kind === "earthquake") {
    return "Revisar información oficial y mantenerse atento a réplicas o avisos complementarios si el evento está cerca.";
  }
  if (classification.isOfficialPrimaryEvidence) {
    return "Mantener vigilancia de actualizaciones oficiales y usar el contexto ARGUS como apoyo operativo.";
  }
  return "Mantener el evento en vigilancia y solicitar evidencia adicional antes de tomar decisiones críticas.";
}

export function calculatePrediction(
  input: ArgusPredictionInput,
  classification: ArgusPredictionClassification,
  context: ArgusPredictionContext
): ArgusPredictionResult {
  const probabilityScore = calculateProbabilityScore(input, classification, context);
  const confidence = calculateConfidenceScore(input, classification, context);
  const severity = calculateSeverity(classification, probabilityScore);
  const status = statusFor(input, classification, probabilityScore);
  const timestamp = nowIso();
  const resultBase = { severity, confidence, status };
  const mode = primaryMode(input, classification, context);
  const evidence = buildEvidence(input, classification, context);
  const officialCopy =
    "ARGUS usa esta fuente como evidencia primaria. El contexto histórico puede apoyar la lectura, pero no reemplaza esta fuente ni confirma por sí solo un evento actual.";
  const citizenCopy =
    "Hipótesis inicial basada en input ciudadano y contexto disponible. Requiere confirmación adicional y no reemplaza información oficial.";
  const hypothesis =
    classification.isOfficialPrimaryEvidence
      ? `Hipótesis ARGUS: el evento "${input.title}" requiere vigilancia operativa con evidencia primaria disponible.`
      : `Hipótesis ARGUS: el evento "${input.title}" es posible y permanece en verificación con la evidencia disponible.`;

  return {
    id: `predictive-${input.id}`,
    inputId: input.id,
    title: input.title,
    analysisTitle: "ANÁLISIS INTELIGENCIA ARGUS",
    status,
    primaryMode: mode,
    probabilityLabel: probabilityLabel(probabilityScore),
    probabilityScore,
    confidence,
    uncertainty: calculateUncertainty(confidence),
    severity,
    hypothesis,
    summary:
      status === "confirmed_by_official_source"
        ? "Estimación ARGUS basada en evidencia primaria y contexto de apoyo disponible."
        : "Estimación ARGUS en vigilancia; la hipótesis requiere confirmación con evidencia adicional.",
    explanation: classification.isOfficialPrimaryEvidence ? officialCopy : citizenCopy,
    recommendedAction: recommendedActionFor(input, classification),
    publicMessage:
      "Estimación ARGUS: escenario posible en vigilancia. No es una predicción exacta ni reemplaza información oficial.",
    operatorMessage:
      "Revisar evidencia primaria, fuentes de apoyo y limitaciones antes de elevar prioridad operativa.",
    limitations: [
      "No reemplaza información oficial.",
      "El contexto histórico apoya la lectura, pero no confirma por sí solo un evento actual.",
      ...(input.latitude === undefined || input.longitude === undefined
        ? ["Faltan coordenadas para estimación geoespacial completa."]
        : []),
    ],
    evidence,
    nearbyUserAlertEligible: shouldNotifyNearbyUser(resultBase),
    notificationEligible: shouldNotifyNearbyUser(resultBase) || classification.isOfficialPrimaryEvidence,
    fenixEligible: shouldSendToFenix(input, resultBase),
    commandCenterEligible: shouldSendToCommandCenter(resultBase),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
