import type { OsmCategoryDefinition, OsmPurpose } from "@/types/osm";

const commonCaveats = [
  "OpenStreetMap is collaborative data with variable regional completeness.",
  "Mapped presence does not guarantee current operation, official status, staffing, stock or emergency availability.",
];

function category(input: Omit<OsmCategoryDefinition, "caveats"> & { caveats?: string[] }): OsmCategoryDefinition {
  return { ...input, caveats: [...commonCaveats, ...(input.caveats ?? [])] };
}

export const osmCategoryRegistry = [
  category({
    id: "medical_hospital",
    label: "Hospitals",
    group: "medical",
    tags: [{ key: "amenity", value: "hospital" }, { key: "healthcare", value: "hospital" }],
    moduleUse: ["AURA", "Command Center", "Risk", "Fenix"],
    defaultEnabled: true,
    maxRadiusKm: 10,
    maxElements: 100,
    geometryMode: "centroid_and_simple_geometry",
  }),
  category({
    id: "medical_clinic",
    label: "Clinics",
    group: "medical",
    tags: [{ key: "amenity", value: "clinic" }, { key: "healthcare", value: "clinic" }],
    moduleUse: ["AURA", "Command Center", "Risk"],
    defaultEnabled: true,
    maxRadiusKm: 10,
    maxElements: 100,
    geometryMode: "centroid_and_simple_geometry",
  }),
  category({
    id: "medical_doctors",
    label: "Doctors",
    group: "medical",
    tags: [{ key: "amenity", value: "doctors" }, { key: "healthcare", value: "doctor" }],
    moduleUse: ["AURA"],
    defaultEnabled: true,
    maxRadiusKm: 10,
    maxElements: 100,
    geometryMode: "centroid",
  }),
  category({
    id: "medical_pharmacy",
    label: "Pharmacies",
    group: "medical",
    tags: [{ key: "amenity", value: "pharmacy" }, { key: "healthcare", value: "pharmacy" }],
    moduleUse: ["AURA", "Logistics"],
    defaultEnabled: true,
    maxRadiusKm: 10,
    maxElements: 100,
    geometryMode: "centroid",
  }),
  category({
    id: "medical_defibrillator",
    label: "Defibrillators / AED",
    group: "medical",
    tags: [{ key: "emergency", value: "defibrillator" }],
    moduleUse: ["AURA", "Command Center"],
    defaultEnabled: true,
    maxRadiusKm: 10,
    maxElements: 100,
    geometryMode: "centroid",
  }),
  category({
    id: "medical_ambulance_station",
    label: "Ambulance Stations",
    group: "medical",
    tags: [{ key: "emergency", value: "ambulance_station" }],
    moduleUse: ["AURA", "Command Center"],
    defaultEnabled: true,
    maxRadiusKm: 10,
    maxElements: 100,
    geometryMode: "centroid",
    caveats: ["Mapped ambulance station does not mean an ambulance is currently available."],
  }),
  category({
    id: "medical_helipad",
    label: "Helipads",
    group: "medical",
    tags: [{ key: "aeroway", value: "helipad" }],
    moduleUse: ["AURA", "NAV", "Logistics"],
    defaultEnabled: false,
    maxRadiusKm: 25,
    maxElements: 80,
    geometryMode: "centroid_and_simple_geometry",
  }),
  category({
    id: "emergency_fire_station",
    label: "Fire Stations",
    group: "emergency",
    tags: [{ key: "amenity", value: "fire_station" }],
    moduleUse: ["Command Center", "Risk"],
    defaultEnabled: true,
    maxRadiusKm: 10,
    maxElements: 100,
    geometryMode: "centroid",
  }),
  category({
    id: "emergency_police",
    label: "Police",
    group: "emergency",
    tags: [{ key: "amenity", value: "police" }],
    moduleUse: ["Command Center", "Risk"],
    defaultEnabled: true,
    maxRadiusKm: 10,
    maxElements: 100,
    geometryMode: "centroid",
  }),
  category({
    id: "emergency_hydrant",
    label: "Fire Hydrants",
    group: "emergency",
    tags: [{ key: "emergency", value: "fire_hydrant" }],
    moduleUse: ["Command Center", "Fenix"],
    defaultEnabled: false,
    maxRadiusKm: 5,
    maxElements: 150,
    geometryMode: "centroid",
    heavy: true,
  }),
  category({
    id: "emergency_assembly_point",
    label: "Assembly Points",
    group: "emergency",
    tags: [{ key: "emergency", value: "assembly_point" }],
    moduleUse: ["Fenix", "Command Center"],
    defaultEnabled: true,
    maxRadiusKm: 25,
    maxElements: 100,
    geometryMode: "centroid",
  }),
  category({ id: "shelter", label: "Shelters", group: "shelter", tags: [{ key: "amenity", value: "shelter" }, { key: "social_facility", value: "shelter" }], moduleUse: ["Fenix", "Command Center"], defaultEnabled: true, maxRadiusKm: 25, maxElements: 100, geometryMode: "centroid_and_simple_geometry", caveats: ["Do not treat mapped shelters as official or currently open unless another authority confirms it."] }),
  category({ id: "community_centre", label: "Community Centres", group: "shelter", tags: [{ key: "amenity", value: "community_centre" }], moduleUse: ["Fenix"], defaultEnabled: true, maxRadiusKm: 25, maxElements: 100, geometryMode: "centroid" }),
  category({ id: "school", label: "Schools", group: "shelter", tags: [{ key: "amenity", value: "school" }], moduleUse: ["Fenix", "Risk"], defaultEnabled: true, maxRadiusKm: 25, maxElements: 100, geometryMode: "centroid" }),
  category({ id: "university", label: "Universities", group: "shelter", tags: [{ key: "amenity", value: "university" }], moduleUse: ["Fenix"], defaultEnabled: false, maxRadiusKm: 25, maxElements: 80, geometryMode: "centroid" }),
  category({ id: "sports_centre", label: "Sports Centres", group: "shelter", tags: [{ key: "leisure", value: "sports_centre" }], moduleUse: ["Fenix"], defaultEnabled: false, maxRadiusKm: 25, maxElements: 80, geometryMode: "centroid" }),
  category({ id: "camp_site", label: "Camp Sites", group: "shelter", tags: [{ key: "tourism", value: "camp_site" }], moduleUse: ["Fenix", "Logistics"], defaultEnabled: false, maxRadiusKm: 25, maxElements: 80, geometryMode: "centroid" }),
  category({ id: "road", label: "Roads", group: "nav", tags: [{ key: "highway", value: "*" }], moduleUse: ["NAV", "Fenix"], defaultEnabled: false, maxRadiusKm: 5, maxElements: 150, geometryMode: "centroid", heavy: true }),
  category({ id: "bridge", label: "Bridges", group: "nav", tags: [{ key: "bridge", value: "yes" }], moduleUse: ["NAV", "Risk", "Fenix"], defaultEnabled: true, maxRadiusKm: 5, maxElements: 100, geometryMode: "centroid_and_simple_geometry", heavy: true }),
  category({ id: "tunnel", label: "Tunnels", group: "nav", tags: [{ key: "tunnel", value: "yes" }], moduleUse: ["NAV", "Risk"], defaultEnabled: true, maxRadiusKm: 5, maxElements: 100, geometryMode: "centroid_and_simple_geometry", heavy: true }),
  category({ id: "ford", label: "Fords", group: "nav", tags: [{ key: "ford", value: "yes" }], moduleUse: ["NAV", "Risk"], defaultEnabled: false, maxRadiusKm: 5, maxElements: 80, geometryMode: "centroid", heavy: true }),
  category({ id: "barrier", label: "Barriers", group: "nav", tags: [{ key: "barrier", value: "*" }], moduleUse: ["NAV"], defaultEnabled: false, maxRadiusKm: 5, maxElements: 100, geometryMode: "centroid", heavy: true }),
  category({ id: "fuel", label: "Fuel Stations", group: "logistics", tags: [{ key: "amenity", value: "fuel" }], moduleUse: ["NAV", "Logistics", "Command Center"], defaultEnabled: true, maxRadiusKm: 25, maxElements: 100, geometryMode: "centroid" }),
  category({ id: "charging_station", label: "Charging Stations", group: "logistics", tags: [{ key: "amenity", value: "charging_station" }], moduleUse: ["NAV", "Logistics"], defaultEnabled: true, maxRadiusKm: 25, maxElements: 100, geometryMode: "centroid" }),
  category({ id: "supermarket", label: "Supermarkets", group: "logistics", tags: [{ key: "shop", value: "supermarket" }], moduleUse: ["Logistics", "Fenix"], defaultEnabled: false, maxRadiusKm: 25, maxElements: 100, geometryMode: "centroid" }),
  category({ id: "drinking_water", label: "Drinking Water", group: "logistics", tags: [{ key: "amenity", value: "drinking_water" }], moduleUse: ["Logistics", "Fenix"], defaultEnabled: true, maxRadiusKm: 25, maxElements: 100, geometryMode: "centroid" }),
  category({ id: "water_tower", label: "Water Towers", group: "logistics", tags: [{ key: "man_made", value: "water_tower" }], moduleUse: ["Logistics", "Risk"], defaultEnabled: false, maxRadiusKm: 25, maxElements: 80, geometryMode: "centroid" }),
  category({ id: "aerodrome", label: "Aerodromes", group: "logistics", tags: [{ key: "aeroway", value: "aerodrome" }], moduleUse: ["NAV", "Logistics"], defaultEnabled: false, maxRadiusKm: 25, maxElements: 80, geometryMode: "centroid_and_simple_geometry" }),
  category({ id: "port_harbour", label: "Ports / Harbours", group: "logistics", tags: [{ key: "harbour", value: "*" }, { key: "port", value: "*" }], moduleUse: ["NAV", "Logistics"], defaultEnabled: false, maxRadiusKm: 25, maxElements: 80, geometryMode: "centroid_and_simple_geometry" }),
  category({ id: "buildings", label: "Buildings", group: "exposure", tags: [{ key: "building", value: "*" }], moduleUse: ["Fenix", "Risk"], defaultEnabled: false, maxRadiusKm: 3, maxElements: 150, geometryMode: "centroid", heavy: true, caveats: ["Building=* is intentionally restricted to small areas for exposure previews only."] }),
] as const satisfies OsmCategoryDefinition[];

export type OsmCategoryId = (typeof osmCategoryRegistry)[number]["id"];

export const osmCategoryIds = osmCategoryRegistry.map((item) => item.id);

export function getOsmCategory(id: string) {
  return osmCategoryRegistry.find((item) => item.id === id) ?? null;
}

export function isOsmCategoryId(id: string): id is OsmCategoryId {
  return Boolean(getOsmCategory(id));
}

export function getDefaultCategoriesForPurpose(purpose: OsmPurpose): string[] {
  switch (purpose) {
    case "aura_medical":
      return ["medical_hospital", "medical_clinic", "medical_doctors", "medical_pharmacy", "medical_defibrillator", "medical_ambulance_station", "medical_helipad"];
    case "fenix_shelter":
      return ["shelter", "emergency_assembly_point", "school", "community_centre", "sports_centre", "camp_site"];
    case "fenix_exposure":
      return ["shelter", "emergency_assembly_point", "school", "community_centre", "bridge", "tunnel", "buildings"];
    case "nav_route_context":
      return ["road", "bridge", "tunnel", "ford", "barrier", "fuel", "charging_station"];
    case "emergency_services":
      return ["emergency_fire_station", "emergency_police", "emergency_hydrant", "emergency_assembly_point"];
    case "logistics":
      return ["fuel", "charging_station", "supermarket", "drinking_water", "water_tower", "aerodrome", "port_harbour", "medical_helipad"];
    case "command_center_nearby":
    case "incident_context":
      return ["medical_hospital", "medical_clinic", "medical_pharmacy", "emergency_fire_station", "emergency_police", "shelter", "emergency_assembly_point", "fuel", "drinking_water", "bridge", "tunnel"];
    case "map_viewport":
      return ["medical_hospital", "medical_clinic", "medical_pharmacy", "emergency_fire_station", "emergency_police", "shelter", "fuel", "bridge", "tunnel"];
    default:
      return osmCategoryRegistry.filter((item) => item.defaultEnabled && !item.heavy).map((item) => item.id);
  }
}

export const osmAttribution = "© OpenStreetMap contributors";
export const osmLicense = "ODbL";
export const osmCriticalInfrastructureLayer = {
  id: "osm-critical-infrastructure",
  name: "OpenStreetMap Critical Infrastructure",
  sourceId: "osm-overpass",
  layerType: "critical_infrastructure_context",
  isIncidentLayer: false,
  defaultVisible: false,
  requiresConfiguration: false,
  noBulkGlobal: true,
  attributionRequired: true,
  attribution: osmAttribution,
  license: osmLicense,
  sublayers: [
    "Medical",
    "Emergency Services",
    "Shelters / Assembly Points",
    "Roads / Bridges / Tunnels",
    "Fuel / Charging",
    "Water / Logistics",
    "Schools / Community Facilities",
    "Ports / Helipads / Aerodromes",
  ],
};
