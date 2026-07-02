import type {
  FenixAffectedZone,
  FenixConnectedUsersEstimate,
} from "@/types/fenixSimulation";

export function aggregateConnectedUsersByArea(zones: FenixAffectedZone[]): FenixConnectedUsersEstimate {
  const highestZone = zones[zones.length - 1];
  return {
    approximateCount: Math.max(25, Math.round((highestZone?.radiusKm ?? 5) * 18)),
    areaLabel: highestZone?.timeLabel ?? "Área inicial",
    exposureLevel: highestZone?.exposureLevel ?? "medium",
    privacyNote:
      "Sólo agregado aproximado. ARGUS no expone nombres, RUT, email ni ubicación individual.",
    isDemo: true,
  };
}

export function aggregateReportsByArea(zones: FenixAffectedZone[]) {
  return {
    relatedReports: Math.max(3, Math.round((zones.at(-1)?.radiusKm ?? 5) * 1.4)),
    densityLabel: zones.length > 3 ? "high" as const : "medium" as const,
    isDemo: true,
  };
}

export function mergeOfficialAndCitizenSignals() {
  return [
    "Fuentes ciudadanas demo agregadas.",
    "Rutas oficiales no integradas; se usa fallback demo con etiqueta.",
    "Clima/riesgo puede complementar, pero no reemplaza autoridad.",
  ];
}

export function buildFenixEvidenceStack(zones: FenixAffectedZone[]) {
  return {
    zonesEvaluated: zones.length,
    signals: mergeOfficialAndCitizenSignals(),
    privacy: "Usuarios conectados se tratan sólo como conteos agregados.",
  };
}

