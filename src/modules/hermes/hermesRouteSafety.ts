import type { HermesRouteScoreResult, HermesRouteSafetyResult } from "@/modules/hermes/types";

/**
 * Evaluación de seguridad de ruta. Reglas:
 * 1. Riesgo crítico nunca aparece como "segura".
 * 2. Sin datos recientes nunca aparece como "confirmada"/verificada.
 * 3. Reportes contradictorios bajan confianza (ya reflejado en el score).
 * 4. Bloqueos confirmados fuerzan estado "blocked".
 * 5. Sin alternativa, se muestra advertencia explícita.
 * 6. Nunca se promete seguridad absoluta (ningún estado es "100% segura").
 */
export function evaluateHermesRouteSafety(
  scoreResult: HermesRouteScoreResult,
  hasConfirmedBlockageOnRoute: boolean,
  hasAlternative: boolean
): HermesRouteSafetyResult {
  const warnings = [...scoreResult.warnings];

  let status: HermesRouteSafetyResult["status"];
  if (hasConfirmedBlockageOnRoute) {
    status = "blocked";
  } else if (scoreResult.riskScore >= 70) {
    status = "high_risk";
  } else if (scoreResult.riskScore >= 40 || scoreResult.confidence === "low" || scoreResult.confidence === "unknown") {
    status = "caution";
  } else {
    status = "available";
  }

  const requiresInstitutionalConfirmation =
    status === "high_risk" || status === "blocked" || scoreResult.confidence === "low" || scoreResult.confidence === "unknown";

  const shouldRecommendAlternative = status === "blocked" || status === "high_risk";

  if (shouldRecommendAlternative && !hasAlternative) {
    warnings.push({
      id: "warn-no-alternative",
      type: "unknown_condition",
      severity: "high",
      message: "No hay ruta alternativa disponible con mejor evaluación en este momento.",
    });
  }

  return {
    status,
    warnings,
    shouldBlockVisually: status === "blocked",
    requiresInstitutionalConfirmation,
    shouldRecommendAlternative,
  };
}
