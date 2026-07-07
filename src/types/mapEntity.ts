/**
 * Estructura comun de todo punto visible en el mapa operacional de ARGUS.
 * Cada modulo (AURA, FENIX, ATLAS, VIGIA, HERMES, NEXUS, ORACULO) expone sus
 * datos como MapEntity a traves de adaptadores (`src/lib/pois`,
 * `src/lib/incidents`) en lugar de dibujar sus propios marcadores/mapas
 * paralelos. El mapa (`OperationalMap` + `MapEntityCard`) solo entiende este
 * tipo generico; no necesita saber si un punto viene de AURA o de VIGIA.
 */

export type MapEntityType =
  | "hospital"
  | "clinic"
  | "sapu"
  | "shelter"
  | "incident"
  | "hazard"
  | "safe_zone"
  | "user"
  | "resource"
  | "checkpoint"
  | "fire"
  | "flood"
  | "earthquake"
  | "conflict"
  | "custom";

export type MapEntityStatus = "available" | "limited" | "unknown" | "closed" | "active" | "resolved";

export type MapEntitySourceModule =
  | "aura"
  | "fenix"
  | "atlas"
  | "vigia"
  | "hermes"
  | "nexus"
  | "oraculo"
  | "core";

export type MapEntityPriority = "low" | "medium" | "high" | "critical";

export interface MapEntity {
  id: string;
  type: MapEntityType;
  name: string;
  description?: string;
  lat: number;
  lng: number;
  status?: MapEntityStatus;
  capabilities?: string[];
  sourceModule?: MapEntitySourceModule;
  priority?: MapEntityPriority;
  isDemo?: boolean;
  /** Distancia al usuario en km, cuando se conoce la ubicacion de origen. */
  distanceKm?: number;
  /** Id del registro original (MedicalPoint, ArcaShelter, CrisisEvent, ConflictZone...) para acciones especificas del modulo dueño. */
  refId?: string;
}
