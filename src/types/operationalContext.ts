import type { ArgusEventType, ArgusSeverity } from "@/types/argusEvent";
import type { MapLayerState } from "@/components/map/MapLayerControls";
import type { CriticalPoi, CriticalPoiCategory, CriticalPriority } from "@/lib/criticalPoi/criticalPoiTypes";
import type { RawGeometry } from "@/lib/geometry/wildfireGeometry";

/**
 * ARGUS Operational Context Engine — vocabulario compartido.
 *
 * Deliberadamente no reinventa severidad/tipo/lifecycle: reutiliza
 * `ArgusEventType`/`ArgusSeverity` (`src/types/argusEvent.ts`), ya el
 * vocabulario canónico consumido por `MAP_LAYER_REGISTRY` y
 * `ModuleIncidentSummary`. El motor consume `ModuleIncidentSummary`
 * directamente (ver `operationalContextEngine.ts`) — no hay un segundo tipo
 * de "incidente" paralelo aquí.
 */

/**
 * Estado operacional de un recurso — nunca se asume "operativo" solo porque
 * el POI existe o está `active` en el catálogo (mismo principio que
 * `ShelterOperationalStatus`, ver `resourceOperationalState.ts`).
 */
export type ResourceOperationalState =
  | "operational"
  | "limited"
  | "saturated"
  | "evacuated"
  | "closed"
  | "unconfirmed"
  | "out_of_service";

export const RESOURCE_OPERATIONAL_STATE_LABELS: Record<ResourceOperationalState, string> = {
  operational: "Operativo",
  limited: "Limitado",
  saturated: "Saturado",
  evacuated: "Evacuado",
  closed: "Cerrado",
  unconfirmed: "Sin confirmar",
  out_of_service: "Fuera de servicio",
};

/**
 * Fase operacional de la respuesta — derivada del lifecycle canónico ya
 * existente (`ArgusEventStatus`/`CanonicalLifecycle`) en tiempo de
 * resolución, nunca almacenada como un segundo lifecycle paralelo. Ver
 * `operationalContextEngine.ts` → `derivePhaseFromLifecycle`.
 */
export type OperationalResponsePhase = "early_warning" | "active_response" | "stabilization" | "recovery";

/**
 * Tipos de recurso operacional para los que ARGUS todavía no tiene una
 * fuente de datos propia (Fase 10 del mandato: preparar la interfaz, no
 * implementar la API todavía). Ninguno de estos existe hoy como
 * `CriticalPoiCategory` — se modelan aparte a propósito, para no tocar la
 * taxonomía persistida de `CriticalPoi` sin una fuente real detrás.
 */
export type ExternalResourceKind =
  | "mop_infrastructure"
  | "dga_water_authority"
  | "municipality"
  | "telecom_provider"
  | "electricity_provider"
  | "water_utility"
  | "fuel_station"
  | "airport"
  | "seaport"
  | "helipad"
  | "sar_team"
  | "pdi_station"
  | "armed_forces_base"
  | "delegation"
  | "nbq_decontamination_center"
  | "radiological_monitoring_station";

export type OperationalResourceKindOrCategory = CriticalPoiCategory | ExternalResourceKind;

/** Reservado para un futuro motor de rutas — nunca completado con una heurística débil (ver `impactAreaResolver.ts`). */
export interface ImpactAreaCorridor {
  id: string;
  label: string;
}

export interface ImpactAreaBoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/**
 * Área de impacto resuelta para un incidente. Geometría real (polígono de
 * comuna) solo cuando `countryCode === "CL"` y el punto cae dentro de una
 * comuna presente en `src/data/geometries/chileComunas.json` (dataset
 * "grow-as-needed", no cobertura nacional completa) — en cualquier otro caso
 * `hasRealGeometry` es `false` y solo hay buffer circular, nunca un polígono
 * inventado.
 */
export interface ImpactArea {
  anchor: { lat: number; lng: number };
  radiusKm: number;
  bufferBbox: ImpactAreaBoundingBox;
  countryCode: string | null;
  region: string | null;
  province: string | null;
  commune: string | null;
  neighborCommunes: string[];
  polygon: RawGeometry | null;
  hasRealGeometry: boolean;
  corridors: ImpactAreaCorridor[];
  /** Siempre `false` hoy — no hay motor de rutas. Documentado en vez de simulado. */
  corridorsImplemented: boolean;
}

export interface OperationalResourceCandidate {
  id: string;
  kind: "critical_poi" | "external";
  category: OperationalResourceKindOrCategory;
  name: string;
  lat: number;
  lng: number;
  distanceKm: number;
  priority?: CriticalPriority;
  /** Presente solo cuando `kind === "critical_poi"`. */
  poi?: CriticalPoi;
  /** `false` cuando `kind === "external"` y el proveedor todavía no está implementado (Fase 10). */
  providerAvailable: boolean;
}

export interface OperationalResourceCard {
  id: string;
  category: OperationalResourceKindOrCategory;
  categoryLabel: string;
  name: string;
  distanceKm: number | null;
  state: ResourceOperationalState;
  stateLabel: string;
  priority?: CriticalPriority;
  score: number;
  detail?: string;
  atRisk: boolean;
}

/**
 * Perfil amenaza→recursos (Fase 1 + Fase 4 del mandato combinadas en una sola
 * tabla: son la misma tabla vista desde dos ángulos). Array configurable, no
 * `if(type === ...)` — ver `src/data/threatResourceMatrix.ts`.
 */
export interface ThreatResourceProfile {
  id: string;
  eventType: ArgusEventType | "default";
  label: string;
  radiusKmBySeverity: Record<ArgusSeverity, number>;
  resourceCategories: CriticalPoiCategory[];
  externalResourceKinds: ExternalResourceKind[];
  layerKeys: Array<keyof MapLayerState>;
  categoryWeight: Partial<Record<OperationalResourceKindOrCategory, number>>;
}

/** Regla de activación configurable — ver `src/data/operationalContextTriggerRules.ts`. */
export interface OperationalContextTriggerRule {
  id: string;
  label: string;
  minSeverity: ArgusSeverity;
  /** Cuando es `true`, solo cuenta si `sourceSummary.isOfficial` — cubre alertas oficiales (SENAPRED/GDACS/USGS) en severidad media. */
  requireOfficial?: boolean;
}

export interface OperationalContextPackage {
  incidentId: string;
  resolvedAt: string;
  threatProfileId: string;
  responsePhase: OperationalResponsePhase;
  impactArea: ImpactArea;
  resources: OperationalResourceCandidate[];
  cards: OperationalResourceCard[];
  layerActivationPatch: Partial<MapLayerState>;
  triggeredByRuleId: string;
}

export type OperationalContextResult =
  | { activated: false; reason: "trigger_not_matched" | "insufficient_location" }
  | { activated: true; contextPackage: OperationalContextPackage };
