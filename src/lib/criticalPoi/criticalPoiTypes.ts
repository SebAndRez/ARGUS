/**
 * Infraestructura critica mundial persistente: hospitales, policia, gobierno,
 * transporte masivo, justicia, refugios, logistica. Distinto de la capa de
 * POIs urbanos genericos (`src/lib/pois/*`, comercio/servicios P4) y del
 * contexto acotado por incidente de `osmOverpassAdapter` (bundle temporal
 * alrededor de un punto para AURA/FENIX/NAV). Este modulo es el Map Core
 * persistente que AURA/FENIX/ARCA/NEXUS/ATLAS/VIGIA/HERMES/ORACULO consultan
 * por zona, con o sin incidente activo. Ver `criticalPoiCategoryRegistry.ts`
 * para el mapeo de tags OSM -> categoria/prioridad.
 */

export type CriticalPoiCategory =
  | "metro_station"
  | "train_station"
  | "bus_terminal"
  | "hospital"
  | "clinic"
  | "pharmacy"
  | "emergency_care"
  | "police_station"
  | "prison"
  | "fire_station"
  | "government_building"
  | "municipal_office"
  | "public_office"
  | "courthouse"
  | "prosecutor_office"
  | "justice_system"
  | "tax_office"
  | "treasury_office"
  | "customs_office"
  | "civil_registry"
  | "shelter"
  | "school"
  | "stadium"
  | "logistics_center"
  | "supply_center"
  | "telecom_mobile_unit"
  | "telecom_emergency_wifi"
  | "telecom_charging_point";

/**
 * P0 national_critical, P1 emergency_critical, P2 civic_critical,
 * P3 logistics_support, P4 urban_reference (P4 nunca se persiste aqui: es la
 * capa generica de comercio/servicio menor de `src/lib/pois`).
 */
export type CriticalPriority = "P0" | "P1" | "P2" | "P3" | "P4";

export type CriticalPoiSource = "osm" | "wikidata" | "official_open_data" | "manual" | "argus";

export type CriticalPoiStatus = "active" | "unknown" | "closed" | "temporary";

export interface CriticalPoi {
  id: string;
  externalId?: string;
  source: CriticalPoiSource;
  name: string;
  category: CriticalPoiCategory;
  priority: CriticalPriority;
  lat: number;
  lng: number;
  countryCode?: string;
  adminLevel1?: string;
  adminLevel2?: string;
  city?: string;
  address?: string;
  status: CriticalPoiStatus;
  confidence: number;
  lastSeenAt?: string;
  lastVerifiedAt?: string;
  tags?: Record<string, string>;
  sourceUrl?: string;
  isPersistent: boolean;
  isVisibleByDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CriticalPoiBoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export const priorityLabels: Record<CriticalPriority, string> = {
  P0: "P0 · Crítico nacional",
  P1: "P1 · Emergencia crítica",
  P2: "P2 · Crítico cívico",
  P3: "P3 · Soporte logístico",
  P4: "P4 · Referencia urbana",
};

export const priorityRank: Record<CriticalPriority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
  P4: 4,
};
