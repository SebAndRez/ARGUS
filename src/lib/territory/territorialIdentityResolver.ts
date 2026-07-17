import type { ModuleIncidentSummary } from "@/types/moduleOperationalContext";
import type { TerritorialIdentity } from "@/types/territorialDossier";

/**
 * Resuelve la identidad territorial de un incidente canónico ya resuelto.
 * Reutiliza exclusivamente datos que el incidente ya trae — nunca hace una
 * llamada de red, nunca reverse-geocodifica, nunca inventa un nivel
 * administrativo que no puede verificar (ver docstring de
 * `TerritorialIdentity` en `src/types/territorialDossier.ts`).
 *
 * Orden de resolución (Prompt 7 §10, adaptado a lo que el contrato real
 * expone):
 * 1. Geometría de área real (`administrative_area`, ya resuelta por
 *    `argusGeometryResolver.ts` en Prompt 3/5 contra un GeoJSON de límites
 *    reales) — la fuente de mayor confianza, expone los nombres de área
 *    reales que la geometría cubre.
 * 2. Campos canónicos (`countryCode`/`regionCode`) que el incidente ya trae.
 * 3. Solo el punto representativo, sin territorio resuelto.
 */
export function resolveTerritorialIdentity(incident: ModuleIncidentSummary): TerritorialIdentity {
  const { location } = incident;
  const geometry = location.geometry;

  if (geometry.type === "administrative_area") {
    const names = geometry.regionNames.filter((name) => name.trim().length > 0);
    return {
      countryCode: location.countryCode,
      regionCode: location.regionCode,
      latitude: geometry.anchor[0],
      longitude: geometry.anchor[1],
      intersectedAdministrativeAreas: names,
      spansMultipleAdministrativeAreas: names.length > 1,
      resolutionMethod: "administrative_geometry",
      confidence: names.length > 0 ? "high" : "medium",
    };
  }

  if (location.countryCode || location.regionCode) {
    return {
      countryCode: location.countryCode,
      regionCode: location.regionCode,
      latitude: location.latitude,
      longitude: location.longitude,
      intersectedAdministrativeAreas: [],
      spansMultipleAdministrativeAreas: false,
      resolutionMethod: "canonical_fields",
      confidence: "medium",
    };
  }

  if (location.latitude !== null && location.longitude !== null) {
    return {
      countryCode: null,
      regionCode: null,
      latitude: location.latitude,
      longitude: location.longitude,
      intersectedAdministrativeAreas: [],
      spansMultipleAdministrativeAreas: false,
      resolutionMethod: "point_only",
      confidence: "low",
    };
  }

  return {
    countryCode: null,
    regionCode: null,
    latitude: null,
    longitude: null,
    intersectedAdministrativeAreas: [],
    spansMultipleAdministrativeAreas: false,
    resolutionMethod: "not_resolved",
    confidence: "unresolved",
  };
}
