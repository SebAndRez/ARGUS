import type { ArgusEventType, ArgusSeverity } from "@/types/argusEvent";
import type { ThreatResourceProfile } from "@/types/operationalContext";

/**
 * ARGUS Operational Context Engine — Threat-Resource Matrix.
 *
 * Une, en una sola tabla configurable, lo que el mandato describe como "Fase
 * 1 Context Resolver" (radio sugerido, tipo de recursos necesarios) y "Fase 4
 * Threat Resource Matrix" (amenaza → recursos): son la misma tabla vista
 * desde dos ángulos, escribirla dos veces solo crearía una segunda fuente de
 * verdad para mantener sincronizada. Mismo shape/patrón que
 * `src/data/moduleActivationRules.ts` (array + función de consulta pura, sin
 * clase, sin estado mutable).
 *
 * Extensible sin tocar el motor: agregar una amenaza nueva es agregar una
 * fila aquí. `eventType: "default"` es el fallback para cualquier
 * `ArgusEventType` no listado explícitamente (nunca deja un incidente sin
 * perfil).
 */

const NO_RESOURCE_WEIGHT = 50;

function radii(info: number, low: number, medium: number, high: number, critical: number): Record<ArgusSeverity, number> {
  return { info, low, medium, high, critical };
}

export const THREAT_RESOURCE_PROFILES: ThreatResourceProfile[] = [
  {
    id: "wildfire",
    eventType: "WILDFIRE",
    label: "Incendio forestal",
    radiusKmBySeverity: radii(2, 3, 8, 15, 30),
    resourceCategories: ["fire_station", "hospital", "emergency_care", "shelter", "logistics_center"],
    externalResourceKinds: ["mop_infrastructure", "helipad", "fuel_station"],
    layerKeys: ["criticalPois", "medicalPoints", "shelters", "nasaFirms", "airRoutes", "terrestrialRoutes"],
    categoryWeight: { fire_station: 100, hospital: 80, emergency_care: 85, shelter: 70, helipad: 75 },
  },
  {
    id: "flood",
    eventType: "FLOOD",
    label: "Inundación",
    radiusKmBySeverity: radii(1, 2, 5, 10, 20),
    resourceCategories: ["shelter", "hospital", "emergency_care", "fire_station", "municipal_office", "logistics_center"],
    externalResourceKinds: ["dga_water_authority", "mop_infrastructure", "municipality", "fuel_station"],
    layerKeys: ["criticalPois", "shelters", "medicalPoints", "terrestrialRoutes", "argusLandslideFlood"],
    categoryWeight: { shelter: 100, hospital: 80, municipal_office: 70, fire_station: 75 },
  },
  {
    id: "heavy_rain",
    eventType: "HEAVY_RAIN",
    label: "Lluvia intensa",
    radiusKmBySeverity: radii(1, 2, 5, 10, 18),
    resourceCategories: ["shelter", "hospital", "fire_station", "municipal_office"],
    externalResourceKinds: ["dga_water_authority", "mop_infrastructure", "municipality"],
    layerKeys: ["criticalPois", "shelters", "terrestrialRoutes", "argusLandslideFlood"],
    categoryWeight: { shelter: 90, municipal_office: 70, fire_station: 70 },
  },
  {
    id: "landslide",
    eventType: "LANDSLIDE",
    label: "Remoción en masa / deslizamiento",
    radiusKmBySeverity: radii(1, 2, 4, 8, 15),
    resourceCategories: ["shelter", "hospital", "fire_station", "municipal_office"],
    externalResourceKinds: ["mop_infrastructure", "municipality"],
    layerKeys: ["criticalPois", "shelters", "medicalPoints", "terrestrialRoutes", "argusLandslideFlood"],
    categoryWeight: { fire_station: 90, shelter: 80, hospital: 75 },
  },
  {
    id: "earthquake",
    eventType: "EARTHQUAKE",
    label: "Terremoto",
    radiusKmBySeverity: radii(2, 5, 15, 30, 60),
    resourceCategories: ["hospital", "emergency_care", "fire_station", "shelter", "police_station", "logistics_center"],
    externalResourceKinds: ["sar_team", "armed_forces_base", "airport", "seaport", "fuel_station"],
    layerKeys: ["criticalPois", "medicalPoints", "shelters", "usgsEarthquakes", "airRoutes", "maritimeRoutes"],
    categoryWeight: { hospital: 100, emergency_care: 95, fire_station: 90, shelter: 80 },
  },
  {
    id: "tsunami",
    eventType: "TSUNAMI",
    label: "Tsunami",
    radiusKmBySeverity: radii(2, 5, 15, 30, 50),
    resourceCategories: ["shelter", "hospital", "police_station", "fire_station"],
    externalResourceKinds: ["seaport", "armed_forces_base"],
    layerKeys: ["criticalPois", "shelters", "noaaTsunami", "maritimeRoutes"],
    categoryWeight: { shelter: 100, police_station: 70, hospital: 80 },
  },
  {
    id: "coastal_hazard",
    eventType: "COASTAL_HAZARD",
    label: "Riesgo costero",
    radiusKmBySeverity: radii(2, 4, 10, 20, 35),
    resourceCategories: ["shelter", "hospital", "police_station"],
    externalResourceKinds: ["seaport"],
    layerKeys: ["criticalPois", "shelters", "noaaCoopsCoastalObservations", "maritimeRoutes"],
    categoryWeight: { shelter: 90, police_station: 60 },
  },
  {
    id: "volcanic_activity",
    eventType: "VOLCANIC_ACTIVITY",
    label: "Actividad volcánica",
    radiusKmBySeverity: radii(5, 10, 20, 40, 80),
    resourceCategories: ["shelter", "hospital", "fire_station", "logistics_center"],
    externalResourceKinds: ["airport", "mop_infrastructure"],
    layerKeys: ["criticalPois", "shelters", "medicalPoints", "smithsonianGvpVolcanoes", "airRoutes", "terrestrialRoutes"],
    categoryWeight: { shelter: 90, hospital: 75 },
  },
  {
    id: "severe_weather",
    eventType: "SEVERE_WEATHER",
    label: "Tormenta severa",
    radiusKmBySeverity: radii(2, 4, 8, 15, 25),
    resourceCategories: ["shelter", "hospital", "fire_station", "municipal_office"],
    externalResourceKinds: ["municipality"],
    layerKeys: ["criticalPois", "shelters", "terrestrialRoutes"],
    categoryWeight: { shelter: 80, fire_station: 70 },
  },
  {
    id: "tornado",
    eventType: "TORNADO",
    label: "Tornado",
    radiusKmBySeverity: radii(2, 4, 8, 15, 25),
    resourceCategories: ["shelter", "hospital", "emergency_care", "fire_station"],
    externalResourceKinds: ["municipality"],
    layerKeys: ["criticalPois", "shelters", "medicalPoints", "terrestrialRoutes"],
    categoryWeight: { shelter: 90, emergency_care: 80, fire_station: 75 },
  },
  {
    id: "waterspout",
    eventType: "WATERSPOUT",
    label: "Tromba marina",
    radiusKmBySeverity: radii(2, 4, 8, 15, 25),
    resourceCategories: ["shelter", "police_station"],
    externalResourceKinds: ["seaport"],
    layerKeys: ["criticalPois", "maritimeRoutes"],
    categoryWeight: { shelter: 70 },
  },
  {
    id: "severe_wind",
    eventType: "SEVERE_WIND",
    label: "Viento severo",
    radiusKmBySeverity: radii(2, 4, 8, 15, 25),
    resourceCategories: ["shelter", "fire_station", "municipal_office"],
    externalResourceKinds: ["electricity_provider", "municipality"],
    layerKeys: ["criticalPois", "shelters", "terrestrialRoutes"],
    categoryWeight: { fire_station: 75, shelter: 70 },
  },
  {
    id: "civil_unrest",
    eventType: "CIVIL_UNREST",
    label: "Disturbio civil",
    radiusKmBySeverity: radii(1, 2, 4, 8, 15),
    resourceCategories: ["police_station", "hospital", "government_building"],
    externalResourceKinds: ["pdi_station", "armed_forces_base"],
    layerKeys: ["criticalPois", "argusOfficialAlerts"],
    categoryWeight: { police_station: 100, hospital: 70 },
  },
  {
    id: "conflict",
    eventType: "CONFLICT",
    label: "Conflicto",
    radiusKmBySeverity: radii(1, 2, 4, 8, 15),
    resourceCategories: ["police_station", "hospital", "government_building"],
    externalResourceKinds: ["pdi_station", "armed_forces_base"],
    layerKeys: ["criticalPois", "argusOfficialAlerts"],
    categoryWeight: { police_station: 90, hospital: 75 },
  },
  {
    id: "health_emergency",
    eventType: "HEALTH_EMERGENCY",
    label: "Emergencia sanitaria",
    radiusKmBySeverity: radii(2, 4, 8, 15, 25),
    resourceCategories: ["hospital", "clinic", "emergency_care", "pharmacy"],
    externalResourceKinds: [],
    layerKeys: ["criticalPois", "medicalPoints", "hdxHapiHumanitarianContext"],
    categoryWeight: { hospital: 100, emergency_care: 90, clinic: 80, pharmacy: 60 },
  },
  {
    id: "infrastructure_failure",
    eventType: "INFRASTRUCTURE_FAILURE",
    label: "Falla de infraestructura crítica",
    radiusKmBySeverity: radii(1, 2, 4, 8, 15),
    resourceCategories: ["municipal_office", "hospital", "telecom_mobile_unit", "telecom_emergency_wifi"],
    externalResourceKinds: ["electricity_provider", "telecom_provider", "water_utility"],
    layerKeys: ["criticalPois", "telecomConnectivity"],
    categoryWeight: { municipal_office: 70, hospital: 80 },
  },
  {
    id: "power_outage",
    eventType: "POWER_OUTAGE",
    label: "Corte de energía",
    radiusKmBySeverity: radii(1, 2, 4, 8, 15),
    resourceCategories: ["municipal_office", "hospital", "telecom_mobile_unit"],
    externalResourceKinds: ["electricity_provider"],
    layerKeys: ["criticalPois", "telecomConnectivity"],
    categoryWeight: { hospital: 85, municipal_office: 60 },
  },
  {
    id: "structural_collapse",
    eventType: "STRUCTURAL_COLLAPSE",
    label: "Colapso estructural",
    radiusKmBySeverity: radii(1, 2, 4, 8, 15),
    resourceCategories: ["fire_station", "hospital", "emergency_care", "police_station"],
    externalResourceKinds: ["sar_team"],
    layerKeys: ["criticalPois", "medicalPoints"],
    categoryWeight: { fire_station: 100, emergency_care: 90, hospital: 85 },
  },
  {
    id: "roof_collapse",
    eventType: "ROOF_COLLAPSE",
    label: "Colapso de techumbre",
    radiusKmBySeverity: radii(1, 1, 3, 6, 12),
    resourceCategories: ["fire_station", "hospital", "emergency_care"],
    externalResourceKinds: ["sar_team"],
    layerKeys: ["criticalPois", "medicalPoints"],
    categoryWeight: { fire_station: 95, emergency_care: 85 },
  },
  {
    id: "building_collapse",
    eventType: "BUILDING_COLLAPSE",
    label: "Colapso de edificación",
    radiusKmBySeverity: radii(1, 2, 4, 8, 15),
    resourceCategories: ["fire_station", "hospital", "emergency_care", "police_station"],
    externalResourceKinds: ["sar_team", "armed_forces_base"],
    layerKeys: ["criticalPois", "medicalPoints"],
    categoryWeight: { fire_station: 100, emergency_care: 90, hospital: 85 },
  },
  {
    id: "road_closure",
    eventType: "ROAD_CLOSURE",
    label: "Corte de ruta",
    radiusKmBySeverity: radii(1, 1, 3, 6, 10),
    resourceCategories: ["municipal_office", "fire_station", "police_station"],
    externalResourceKinds: ["mop_infrastructure"],
    layerKeys: ["criticalPois", "terrestrialRoutes"],
    categoryWeight: { municipal_office: 70, police_station: 60 },
  },
  {
    id: "default",
    eventType: "default",
    label: "Perfil genérico (tipo no mapeado explícitamente)",
    radiusKmBySeverity: radii(1, 2, 5, 10, 20),
    resourceCategories: ["hospital", "police_station", "fire_station", "shelter", "municipal_office"],
    externalResourceKinds: ["municipality"],
    layerKeys: ["criticalPois"],
    categoryWeight: {},
  },
];

/** Devuelve el perfil de la amenaza, cayendo al perfil `"default"` cuando el tipo no tiene fila propia — nunca deja un incidente sin perfil. */
export function getThreatResourceProfile(eventType: ArgusEventType): ThreatResourceProfile {
  return THREAT_RESOURCE_PROFILES.find((profile) => profile.eventType === eventType)
    ?? THREAT_RESOURCE_PROFILES.find((profile) => profile.eventType === "default")!;
}

/** Peso de categoría para el scoring (Fase 5) — cae a `NO_RESOURCE_WEIGHT` cuando el perfil no declara un peso explícito para esa categoría. */
export function getCategoryWeight(profile: ThreatResourceProfile, category: ThreatResourceProfile["resourceCategories"][number] | string): number {
  return profile.categoryWeight[category as keyof typeof profile.categoryWeight] ?? NO_RESOURCE_WEIGHT;
}
