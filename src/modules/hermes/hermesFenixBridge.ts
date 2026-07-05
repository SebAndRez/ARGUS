import type { HermesFenixSignal, HermesRoute } from "@/modules/hermes/types";

/**
 * Prepara datos limpios y trazables de rutas para futuros escenarios de
 * FÉNIX. No simula nada — solo entrega candidatas, bloqueadas, de
 * evacuación, tiempos estimados, advertencias, confianza y datos faltantes.
 */
export function prepareHermesRoutesForFenixScenario(
  routes: HermesRoute[],
  context: { purpose?: HermesRoute["purpose"] } = {}
): HermesFenixSignal {
  const relevant = context.purpose ? routes.filter((route) => route.purpose === context.purpose) : routes;

  const candidateRouteIds = relevant.filter((route) => route.status === "available" || route.status === "caution").map((r) => r.id);
  const blockedRouteIds = relevant.filter((route) => route.status === "blocked").map((r) => r.id);
  const evacuationRouteIds = relevant.filter((route) => route.purpose === "evacuation").map((r) => r.id);

  const estimatedDurationsSeconds: Record<string, number | undefined> = {};
  relevant.forEach((route) => {
    estimatedDurationsSeconds[route.id] = route.estimatedDurationSeconds;
  });

  const warnings = relevant.flatMap((route) => route.warnings);

  const confidenceRank = { unknown: 0, low: 1, medium: 2, high: 3, verified: 4 } as const;
  const worstConfidence = relevant.reduce<HermesRoute["confidence"]>((worst, route) => {
    return confidenceRank[route.confidence] < confidenceRank[worst] ? route.confidence : worst;
  }, "verified");

  const missingData: string[] = [];
  if (relevant.some((route) => !route.distanceMeters)) missingData.push("Distancia estimada faltante en alguna ruta.");
  if (relevant.some((route) => route.confidence === "unknown" || route.confidence === "low")) {
    missingData.push("Confianza baja en alguna ruta candidata.");
  }
  if (relevant.length === 0) missingData.push("Sin rutas disponibles para este propósito.");

  return {
    candidateRouteIds,
    blockedRouteIds,
    evacuationRouteIds,
    estimatedDurationsSeconds,
    warnings,
    confidence: worstConfidence,
    missingData,
  };
}
