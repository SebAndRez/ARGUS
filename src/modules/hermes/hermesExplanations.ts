import type { HermesRoute, HermesRouteScoreResult } from "@/modules/hermes/types";

/**
 * Genera una explicación breve y trazable de por qué se sugiere (o no) una
 * ruta. Nunca afirma "esta es la única ruta oficial" ni "100% segura".
 */
export function generateHermesRouteExplanation(
  route: Pick<HermesRoute, "status" | "name">,
  scoreResult: HermesRouteScoreResult
): string {
  const parts: string[] = [];

  if (route.status === "blocked") {
    parts.push(
      `Ruta no recomendada. ${scoreResult.penalties[0] ?? "Presenta un bloqueo confirmado."} Verifique instrucciones oficiales si existen.`
    );
  } else if (route.status === "high_risk") {
    parts.push(
      `Ruta con riesgo alto. ${scoreResult.penalties.slice(0, 2).join(" ") || "Presenta condiciones adversas en el trazado."}`
    );
  } else {
    parts.push(
      `Ruta sugerida según reportes disponibles, riesgo estimado y bloqueos conocidos${
        scoreResult.reasons.length > 0 ? ` (${scoreResult.reasons[0].toLowerCase()})` : ""
      }.`
    );
  }

  if (scoreResult.confidence === "low" || scoreResult.confidence === "unknown") {
    parts.push("Presenta confianza baja porque existen pocos datos recientes en el tramo.");
  }

  if (scoreResult.penalties.length > 0 && route.status !== "blocked") {
    parts.push(`Aspectos a considerar: ${scoreResult.penalties.slice(0, 2).join("; ").toLowerCase()}.`);
  }

  parts.push("Verifique instrucciones oficiales si existen; HERMES no reemplaza protocolos de evacuación.");

  return parts.join(" ");
}
