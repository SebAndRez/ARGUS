import type { EventSeverity, HelpPriority } from "@/types/crisis";

const KEYWORD_SEVERITY: Record<string, EventSeverity> = {
  incendio: "CRITICAL",
  arma: "CRITICAL",
  herido: "HIGH",
  choque: "HIGH",
  humo: "HIGH",
  explosión: "CRITICAL",
  atrapado: "HIGH",
  peligro: "HIGH",
};

const KEYWORD_PRIORITY: Record<string, HelpPriority> = {
  incendio: "CRITICAL",
  arma: "CRITICAL",
  herido: "HIGH",
  choque: "HIGH",
  humo: "HIGH",
  explosión: "CRITICAL",
  atrapado: "HIGH",
  peligro: "HIGH",
  desastre: "HIGH",
};

function normalizeText(text: string) {
  return text.trim().toLowerCase();
}

function detectKeywordLevel(text: string) {
  const normalized = normalizeText(text);
  const words = normalized.split(/\W+/);
  for (const word of words) {
    if (KEYWORD_SEVERITY[word]) return word;
  }
  return null;
}

function scoreConfidence(text: string) {
  const length = Math.min(Math.max(text.length, 20), 220);
  return Math.round(60 + (length / 220) * 30);
}

export function analyzeReport(title: string, description: string, category: string) {
  const source = `${title} ${description} ${category}`;
  const keyword = detectKeywordLevel(source);
  const severity = keyword ? KEYWORD_SEVERITY[keyword] : "MEDIUM";
  const aiSummary = `Análisis preliminar de la alerta: se detecta un posible evento de ${category.toLowerCase()} con prioridad ${severity.toLowerCase()}.`;
  const aiRecommendation = `Recomendado: enviar equipo de respuesta a la ubicación reportada y priorizar verificación rápida.`;
  const aiConfidence = scoreConfidence(source);
  const falseReportRisk = keyword === "arma" || keyword === "explosión" ? 32 : 18;

  return { severity, aiSummary, aiRecommendation, aiConfidence, falseReportRisk };
}

export function analyzeHelpRequest(title: string, description: string, category: string) {
  const source = `${title} ${description} ${category}`;
  const keyword = detectKeywordLevel(source);
  const priority = keyword ? KEYWORD_PRIORITY[keyword] : "MEDIUM";
  const aiSummary = `Solicitud de ayuda clasificada como ${priority.toLowerCase()} basada en la descripción.`;
  const aiRecommendation = `Enviar unidad de apoyo y coordinar con operadores locales.`;
  const aiConfidence = scoreConfidence(source);

  return { priority, aiSummary, aiRecommendation, aiConfidence };
}
