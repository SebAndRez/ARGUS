import type {
  QuakeSenseCitizenSignal,
  QuakeSenseCluster,
  QuakeSenseSeverity,
} from "@/types/quakesense";

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

export function classifyClusterSeverity(signalCount: number, confidence: number): QuakeSenseSeverity {
  if (signalCount >= 10 && confidence >= 75) return "high";
  if (signalCount >= 5 && confidence >= 55) return "medium";
  if (signalCount >= 2) return "low";
  return "isolated";
}

export function calculateClusterConfidence(cluster: Pick<QuakeSenseCluster, "signalCount" | "confidence">) {
  return Math.min(100, Math.round(cluster.confidence + Math.min(35, cluster.signalCount * 4)));
}

export function buildQuakeSenseClusterSummary(cluster: Pick<QuakeSenseCluster, "signalCount" | "severity">) {
  if (cluster.signalCount <= 1) {
    return "Senal ciudadana aislada. Estimacion ARGUS, no confirmacion oficial.";
  }
  return "Alerta preliminar: posible sacudida detectada por red ciudadana de sensores. Estimacion ARGUS, pendiente de confirmacion oficial.";
}

export function buildQuakeSenseRecommendedAction() {
  return "Si sientes movimiento, agachate, cubrete y afirmate. Espera informacion oficial de CSN, SENAPRED, SHOA, USGS u otras fuentes competentes.";
}

export function clusterSignalsByTimeAndArea(
  signals: QuakeSenseCitizenSignal[]
): QuakeSenseCluster[] {
  const valid = signals.filter(
    (signal) =>
      signal.userConsent &&
      typeof signal.latRounded === "number" &&
      typeof signal.lngRounded === "number"
  );
  if (valid.length === 0) return [];

  const centerLat = average(valid.map((signal) => Number(signal.latRounded)));
  const centerLng = average(valid.map((signal) => Number(signal.lngRounded)));
  const confidence = Math.round(average(valid.map((signal) => signal.confidence)));
  const severity = classifyClusterSeverity(valid.length, confidence);
  const dates = valid.map((signal) => new Date(signal.detectedAt).getTime()).filter(Number.isFinite);
  const first = new Date(Math.min(...dates)).toISOString();
  const last = new Date(Math.max(...dates)).toISOString();
  const status = valid.length >= 5 ? "MULTI_DEVICE_PATTERN" : "POSSIBLE_SHAKE";
  const cluster: QuakeSenseCluster = {
    id: `qs-cluster-${centerLat.toFixed(2)}-${centerLng.toFixed(2)}-${valid.length}`,
    centerLat,
    centerLng,
    radiusKm: valid.length >= 5 ? 10 : 6,
    signalCount: valid.length,
    windowSeconds: Math.max(5, Math.round((new Date(last).getTime() - new Date(first).getTime()) / 1000)),
    confidence,
    severity,
    firstDetectedAt: first,
    lastDetectedAt: last,
    status,
    argusSummary: buildQuakeSenseClusterSummary({ signalCount: valid.length, severity }),
    recommendedAction: buildQuakeSenseRecommendedAction(),
    isDemo: valid.some((signal) => signal.isDemo),
  };

  return [
    {
      ...cluster,
      confidence: calculateClusterConfidence(cluster),
    },
  ];
}
