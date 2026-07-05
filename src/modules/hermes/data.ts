import type { HermesBlockage, HermesRiskZone } from "@/modules/hermes/types";

/**
 * Bloqueos y zonas de riesgo demo profesionales, usados cuando no hay datos
 * reales suficientes de VIGÍA/ORÁCULO/TALOS. Sin direcciones personales
 * reales, sin afirmar que son oficiales.
 */
export const hermesDemoBlockages: HermesBlockage[] = [
  {
    id: "hermes-demo-flood",
    type: "flood",
    status: "confirmed",
    severity: "high",
    location: { lat: -33.51, lng: -70.71, label: "Paso bajo nivel, sector poniente" },
    affectedRadiusMeters: 300,
    sourceModule: "VIGIA",
    confidence: "medium",
    createdAt: new Date(Date.now() - 70 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
  },
  {
    id: "hermes-demo-accident",
    type: "traffic_accident",
    status: "confirmed",
    severity: "medium",
    location: { lat: -33.44, lng: -70.61, label: "Cruce vial, sector centro" },
    affectedRadiusMeters: 150,
    sourceModule: "VIGIA",
    confidence: "high",
    createdAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  },
  {
    id: "hermes-demo-fallen-tree",
    type: "road_block",
    status: "confirmed",
    severity: "medium",
    location: { lat: -33.47, lng: -70.64, label: "Avenida principal, sector oriente" },
    affectedRadiusMeters: 120,
    sourceModule: "VIGIA",
    confidence: "high",
    createdAt: new Date(Date.now() - 55 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
  },
  {
    id: "hermes-demo-landslide",
    type: "landslide",
    status: "reported",
    severity: "high",
    location: { lat: -33.06, lng: -71.4, label: "Ruta costera, km 36" },
    affectedRadiusMeters: 200,
    sourceModule: "VIGIA",
    confidence: "low",
    createdAt: new Date(Date.now() - 240 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 200 * 60 * 1000).toISOString(),
  },
];

export const hermesDemoRiskZones: HermesRiskZone[] = [
  {
    id: "hermes-demo-zone-wildfire",
    center: { lat: -33.38, lng: -70.72, label: "Ladera periurbana, sector poniente" },
    radiusMeters: 900,
    riskLevel: "critical",
    category: "fire",
    confidence: "medium",
    recommendedModules: ["argus-aura", "argus-hermes", "argus-arca", "argus-nexus", "argus-talos"],
  },
  {
    id: "hermes-demo-zone-flood",
    center: { lat: -33.51, lng: -70.71, label: "Paso bajo nivel, sector poniente" },
    radiusMeters: 400,
    riskLevel: "high",
    category: "flood",
    confidence: "medium",
    recommendedModules: ["argus-hermes", "argus-arca"],
  },
];
