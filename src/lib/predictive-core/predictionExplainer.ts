import type { ArgusPredictionResult } from "@/types/predictiveCore";

export function getAnalysisDisplayTitle(locale: "es" | "en" = "es") {
  return locale === "en" ? "ARGUS INTELLIGENCE ANALYSIS" : "ANÁLISIS INTELIGENCIA ARGUS";
}

export function buildSpanishAnalysisCopy(result: ArgusPredictionResult) {
  return {
    title: getAnalysisDisplayTitle("es"),
    hypothesis: result.hypothesis,
    summary: result.summary,
    explanation: result.explanation,
    recommendedAction: result.recommendedAction,
    disclaimer:
      "Estimación ARGUS: no es una predicción exacta ni reemplaza información oficial.",
  };
}

export function buildEnglishAnalysisCopy(result: ArgusPredictionResult) {
  return {
    title: getAnalysisDisplayTitle("en"),
    hypothesis: result.hypothesis.replace("Hipótesis ARGUS", "ARGUS hypothesis"),
    summary:
      "ARGUS estimate under monitoring. This is not an exact prediction and does not replace official information.",
    explanation: result.explanation,
    recommendedAction: result.recommendedAction,
    disclaimer:
      "ARGUS estimate: not an exact prediction and does not replace official information.",
  };
}
