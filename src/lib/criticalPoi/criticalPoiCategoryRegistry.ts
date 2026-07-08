import type { CriticalPoiCategory, CriticalPriority } from "@/lib/criticalPoi/criticalPoiTypes";

/**
 * Registro unico de categorias de infraestructura critica: mapeo de tags OSM,
 * prioridad por defecto y modulos ARGUS que la consumen. Separado a proposito
 * de `src/lib/osm/osmCategoryRegistry.ts` (usado por `osmOverpassAdapter`
 * para bundles de contexto acotados a un incidente/ruta/simulacion): esa
 * tabla ya esta en produccion con tests propios y no cubre gobierno/justicia/
 * transporte masivo/carceles. Reusar sus ids habria arriesgado ese pipeline
 * para un caso de uso distinto (capa persistente navegable por zona, sin
 * incidente). Donde ambas tablas describen lo mismo (hospital, clinica,
 * bomberos, policia, refugio, colegio) los tags OSM coinciden a proposito.
 *
 * Prioridad por defecto de cada categoria (ver `criticalPoiTypes.ts`):
 * P0 nacional/soberano, P1 emergencia, P2 civico, P3 soporte logistico.
 * P4 (comercio/servicio menor) no vive aca: sigue en `src/lib/pois` sin
 * persistencia, tal como antes.
 */

export type CriticalPoiModule =
  | "AURA"
  | "FENIX"
  | "ARCA"
  | "NEXUS"
  | "ATLAS"
  | "VIGIA"
  | "HERMES"
  | "ORACULO";

export interface CriticalPoiTagMatcher {
  key: string;
  value: string; // "*" = cualquier valor no vacio para esa key
}

export interface CriticalPoiCategoryDefinition {
  id: CriticalPoiCategory;
  label: string;
  priority: CriticalPriority;
  tags: CriticalPoiTagMatcher[];
  moduleUse: CriticalPoiModule[];
  /** Falso para categorias con matching OSM debil/heuristico (ver comentario en la definicion). Se refleja como caveat en la ficha. */
  wellMappedInOsm: boolean;
}

export const criticalPoiCategoryRegistry: CriticalPoiCategoryDefinition[] = [
  // "railway"="station" a secas NO va aca (queda ambiguo con train_station): solo
  // se clasifica como metro si trae station=subway o es un subway_entrance.
  { id: "metro_station", label: "Estación de metro", priority: "P2", tags: [{ key: "station", value: "subway" }, { key: "railway", value: "subway_entrance" }], moduleUse: ["NEXUS", "ATLAS", "VIGIA"], wellMappedInOsm: true },
  { id: "train_station", label: "Estación central de tren", priority: "P1", tags: [{ key: "railway", value: "station" }, { key: "public_transport", value: "station" }], moduleUse: ["NEXUS", "ARCA", "ATLAS"], wellMappedInOsm: true },
  { id: "bus_terminal", label: "Terminal de buses", priority: "P1", tags: [{ key: "amenity", value: "bus_station" }], moduleUse: ["NEXUS", "ARCA", "ATLAS"], wellMappedInOsm: true },
  { id: "hospital", label: "Hospital", priority: "P1", tags: [{ key: "amenity", value: "hospital" }, { key: "healthcare", value: "hospital" }], moduleUse: ["AURA", "NEXUS", "VIGIA", "ORACULO"], wellMappedInOsm: true },
  { id: "clinic", label: "Clínica", priority: "P2", tags: [{ key: "amenity", value: "clinic" }, { key: "healthcare", value: "clinic" }], moduleUse: ["AURA", "NEXUS"], wellMappedInOsm: true },
  { id: "pharmacy", label: "Farmacia", priority: "P2", tags: [{ key: "amenity", value: "pharmacy" }, { key: "healthcare", value: "pharmacy" }], moduleUse: ["AURA"], wellMappedInOsm: true },
  { id: "emergency_care", label: "Urgencia / SAPU-CESFAM", priority: "P1", tags: [{ key: "healthcare", value: "emergency" }, { key: "emergency", value: "yes" }], moduleUse: ["AURA", "VIGIA"], wellMappedInOsm: false },
  { id: "police_station", label: "Comisaría", priority: "P1", tags: [{ key: "amenity", value: "police" }], moduleUse: ["NEXUS", "VIGIA", "HERMES"], wellMappedInOsm: true },
  { id: "prison", label: "Cárcel", priority: "P0", tags: [{ key: "amenity", value: "prison" }], moduleUse: ["NEXUS", "ATLAS"], wellMappedInOsm: true },
  { id: "fire_station", label: "Bomberos", priority: "P1", tags: [{ key: "amenity", value: "fire_station" }], moduleUse: ["NEXUS", "VIGIA", "HERMES"], wellMappedInOsm: true },
  { id: "government_building", label: "Gobierno nacional", priority: "P0", tags: [{ key: "government", value: "national" }, { key: "building", value: "government" }], moduleUse: ["NEXUS", "ATLAS"], wellMappedInOsm: false },
  { id: "municipal_office", label: "Municipalidad", priority: "P2", tags: [{ key: "amenity", value: "townhall" }, { key: "government", value: "local" }], moduleUse: ["NEXUS", "ARCA", "ATLAS"], wellMappedInOsm: true },
  { id: "public_office", label: "Oficina pública", priority: "P2", tags: [{ key: "office", value: "public_service" }, { key: "office", value: "government" }], moduleUse: ["NEXUS"], wellMappedInOsm: false },
  { id: "courthouse", label: "Tribunal", priority: "P0", tags: [{ key: "amenity", value: "courthouse" }], moduleUse: ["NEXUS"], wellMappedInOsm: true },
  { id: "prosecutor_office", label: "Fiscalía", priority: "P2", tags: [{ key: "government", value: "prosecutor" }], moduleUse: ["NEXUS"], wellMappedInOsm: false },
  { id: "justice_system", label: "Sistema de justicia", priority: "P0", tags: [{ key: "government", value: "legal" }], moduleUse: ["NEXUS"], wellMappedInOsm: false },
  { id: "tax_office", label: "Agencia tributaria", priority: "P2", tags: [{ key: "office", value: "tax" }, { key: "government", value: "tax" }], moduleUse: ["NEXUS"], wellMappedInOsm: false },
  { id: "treasury_office", label: "Tesorería", priority: "P0", tags: [{ key: "government", value: "treasury" }], moduleUse: ["NEXUS"], wellMappedInOsm: false },
  { id: "customs_office", label: "Aduana", priority: "P0", tags: [{ key: "government", value: "customs" }], moduleUse: ["NEXUS", "ARCA"], wellMappedInOsm: false },
  { id: "civil_registry", label: "Registro civil", priority: "P2", tags: [{ key: "government", value: "register_office" }], moduleUse: ["NEXUS"], wellMappedInOsm: false },
  { id: "shelter", label: "Refugio", priority: "P3", tags: [{ key: "emergency", value: "shelter" }, { key: "social_facility", value: "shelter" }, { key: "amenity", value: "shelter" }], moduleUse: ["FENIX", "ARCA", "NEXUS"], wellMappedInOsm: true },
  { id: "school", label: "Colegio", priority: "P3", tags: [{ key: "amenity", value: "school" }], moduleUse: ["FENIX", "ATLAS"], wellMappedInOsm: true },
  { id: "stadium", label: "Estadio", priority: "P3", tags: [{ key: "leisure", value: "stadium" }], moduleUse: ["FENIX", "ARCA"], wellMappedInOsm: true },
  { id: "logistics_center", label: "Centro logístico", priority: "P3", tags: [{ key: "building", value: "warehouse" }, { key: "industrial", value: "warehouse" }], moduleUse: ["ARCA", "NEXUS"], wellMappedInOsm: false },
  { id: "supply_center", label: "Centro de acopio", priority: "P3", tags: [{ key: "social_facility", value: "food_bank" }, { key: "amenity", value: "marketplace" }], moduleUse: ["ARCA", "FENIX"], wellMappedInOsm: false },
];

export function getCriticalPoiCategory(id: string): CriticalPoiCategoryDefinition | null {
  return criticalPoiCategoryRegistry.find((item) => item.id === id) ?? null;
}

export function isCriticalPoiCategoryId(id: string): id is CriticalPoiCategory {
  return Boolean(getCriticalPoiCategory(id));
}

export function getCategoriesByPriority(priority: CriticalPriority): CriticalPoiCategoryDefinition[] {
  return criticalPoiCategoryRegistry.filter((item) => item.priority === priority);
}

export function getCategoriesForModule(module: CriticalPoiModule): CriticalPoiCategoryDefinition[] {
  return criticalPoiCategoryRegistry.filter((item) => item.moduleUse.includes(module));
}

/** Primera categoria cuyos tags matchean; una entidad OSM puede calzar con varias (p.ej. townhall matchea municipal_office y podria matchear government_building) asi que el orden del registro decide la prioridad de clasificacion. */
export function classifyCriticalPoiTags(tags: Record<string, string>): CriticalPoiCategory[] {
  return criticalPoiCategoryRegistry
    .filter((category) => category.tags.some((matcher) => tags[matcher.key] !== undefined && (matcher.value === "*" || tags[matcher.key] === matcher.value)))
    .map((category) => category.id);
}

export const criticalPoiOsmAttribution = "© OpenStreetMap contributors";
export const criticalPoiOsmLicense = "ODbL";
