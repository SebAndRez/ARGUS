import { auraMedicalPoints } from "@/data/auraMedicalPoints";
import { arcaDemoShelters } from "@/modules/arca/data";
import { evaluateAuraMedicalPointAvailability } from "@/modules/aura/auraMedicalPoints";
import type { AuraMedicalPoint } from "@/modules/aura/types";
import type { ArcaShelter } from "@/modules/arca/types";
import type { MapEntity, MapEntityStatus, MapEntityType } from "@/types/mapEntity";
import type { GeoPoint } from "@/lib/routing/routingService";
import type { MedicalPoint } from "@/types/medical";

/**
 * Puntos de interes "estables" del mapa (hospitales, clinicas, SAPU,
 * refugios): reutiliza las fuentes de datos ya existentes de AURA y ARCA en
 * lugar de crear un dataset paralelo. Este es el unico lugar que convierte
 * `AuraMedicalPoint`/`ArcaShelter` a `MapEntity` para el mapa operacional.
 */

function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const radiusKm = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * radiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

const auraTypeToEntityType: Record<AuraMedicalPoint["type"], MapEntityType> = {
  hospital: "hospital",
  clinic: "clinic",
  field_medical_point: "sapu",
  ambulance_base: "resource",
  triage_point: "sapu",
  // Punto medico de AURA ubicado en un refugio: sigue siendo un recurso de
  // AURA (no un refugio ARCA), asi que se mapea a "sapu" para no disparar
  // acciones de FENIX (Capacidad/Abrir FENIX) sobre un punto que AURA es
  // quien realmente administra.
  shelter_medical_point: "sapu",
  temporary_care_point: "sapu",
  pharmacy: "resource",
  other: "custom",
};

function auraStatusToEntityStatus(point: AuraMedicalPoint): MapEntityStatus {
  if (point.status === "closed") return "closed";
  const { capacityStatus } = evaluateAuraMedicalPointAvailability(point);
  if (capacityStatus === "unknown") return "unknown";
  if (capacityStatus === "saturated" || point.status === "limited") return "limited";
  return "available";
}

function auraServiceCapabilities(point: AuraMedicalPoint): string[] {
  const labels: Array<[keyof AuraMedicalPoint["services"], string]> = [
    ["emergencyCare", "Urgencia"],
    ["triage", "Triaje"],
    ["traumaCare", "Trauma"],
    ["pediatricCare", "Pediatria"],
    ["ambulance", "Ambulancia"],
    ["firstAid", "Primeros auxilios"],
    ["pharmacy", "Farmacia"],
    ["mentalHealthSupport", "Salud mental"],
    ["oxygen", "Oxigeno"],
    ["defibrillator", "Desfibrilador"],
  ];
  return labels.filter(([key]) => point.services[key]).map(([, label]) => label);
}

export function medicalPointToMapEntity(point: AuraMedicalPoint, userLocation?: GeoPoint): MapEntity {
  return {
    id: `hospital-${point.id}`,
    type: auraTypeToEntityType[point.type] ?? "custom",
    name: point.name,
    description: point.publicNotes,
    lat: point.location.lat,
    lng: point.location.lng,
    status: auraStatusToEntityStatus(point),
    capabilities: auraServiceCapabilities(point),
    sourceModule: "aura",
    isDemo: point.confidence === "unknown" || point.confidence === "low",
    distanceKm: userLocation ? haversineKm(userLocation, { lat: point.location.lat, lng: point.location.lng }) : undefined,
    refId: point.id,
  };
}

const simpleMedicalTypeToEntityType: Record<MedicalPoint["type"], MapEntityType> = {
  hospital: "hospital",
  clinic: "clinic",
  sapu: "sapu",
  // Punto medico de AURA en un refugio: sigue siendo un recurso AURA, no un
  // refugio ARCA (ver auraTypeToEntityType mas arriba para el mismo criterio).
  shelter_medical: "sapu",
  temporary_medical_point: "sapu",
};

/**
 * Convierte la vista simplificada `MedicalPoint` (ya usada por el mapa
 * operacional y por AURA SOS rapido) a `MapEntity`, para la ficha compacta.
 * No reemplaza `medicalPointToMapEntity` (que parte de `AuraMedicalPoint`):
 * este adaptador es el que corresponde al flujo real de clicks en el mapa.
 */
export function simpleMedicalPointToMapEntity(point: MedicalPoint): MapEntity {
  return {
    id: `hospital-${point.id}`,
    type: simpleMedicalTypeToEntityType[point.type] ?? "custom",
    name: point.name,
    lat: point.lat,
    lng: point.lng,
    status: point.availabilityStatus,
    capabilities: point.capabilities,
    sourceModule: "aura",
    isDemo: point.isDemo,
    distanceKm: point.distanceKm,
    refId: point.id,
  };
}

const arcaStatusToEntityStatus: Record<ArcaShelter["status"], MapEntityStatus> = {
  active: "available",
  standby: "available",
  limited: "limited",
  full: "limited",
  over_capacity: "limited",
  closed: "closed",
  unknown: "unknown",
};

function arcaServiceCapabilities(shelter: ArcaShelter): string[] {
  const labels: Array<[keyof ArcaShelter["services"], string]> = [
    ["water", "Agua"],
    ["food", "Alimentacion"],
    ["medicalPoint", "Apoyo medico"],
    ["electricity", "Electricidad"],
    ["bathrooms", "Sanitario"],
    ["security", "Seguridad"],
    ["psychologicalSupport", "Apoyo psicologico"],
    ["petFriendly", "Acepta mascotas"],
  ];
  return labels
    .filter(([key]) => shelter.services[key] === "available")
    .map(([, label]) => label);
}

export function arcaShelterToMapEntity(shelter: ArcaShelter, userLocation?: GeoPoint): MapEntity {
  return {
    id: `shelter-${shelter.id}`,
    type: "shelter",
    name: shelter.name,
    description: shelter.publicNotes,
    lat: shelter.location.lat,
    lng: shelter.location.lng,
    status: arcaStatusToEntityStatus[shelter.status] ?? "unknown",
    capabilities: arcaServiceCapabilities(shelter),
    sourceModule: "fenix",
    isDemo: shelter.isDemo ?? (shelter.confidence === "unknown" || shelter.confidence === "low"),
    distanceKm: userLocation ? haversineKm(userLocation, { lat: shelter.location.lat, lng: shelter.location.lng }) : undefined,
    refId: shelter.id,
  };
}

/** Todos los puntos de interes (hospitales/clinicas/SAPU + refugios) como MapEntity, ordenados por distancia si hay origen. */
export function getNearbyPois(userLocation?: GeoPoint): MapEntity[] {
  const entities = [
    ...auraMedicalPoints.map((point) => medicalPointToMapEntity(point, userLocation)),
    ...arcaDemoShelters.map((shelter) => arcaShelterToMapEntity(shelter, userLocation)),
  ];
  return entities.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
}
