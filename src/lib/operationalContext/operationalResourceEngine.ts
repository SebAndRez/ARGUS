import { getCriticalPoisNear } from "@/lib/criticalPoi/criticalPoiPersistenceService";
import { getExternalResourceProvider } from "@/data/externalResourceProviderRegistry";
import { haversineDistanceKm } from "@/lib/geometry/wildfireGeometry";
import type { ImpactArea, OperationalResourceCandidate, ThreatResourceProfile } from "@/types/operationalContext";

/**
 * ARGUS Operational Context Engine — Fase 3 (Operational Resource Engine).
 *
 * Reutiliza `getCriticalPoisNear` (`criticalPoiPersistenceService.ts`), el
 * mismo cliente que ya usan VIGIA/AURA/FENIX para infraestructura crítica por
 * zona — no reimplementa la consulta a `CriticalPoi`. Para categorías sin
 * fuente propia todavía (Fase 10), consulta el registro de proveedores
 * externos y solo llama `fetch` si `implemented === true`; si no, emite un
 * candidato marcador (`providerAvailable: false`) para que las tarjetas
 * (Fase 7) puedan decir "sin proveedor configurado" en vez de omitir la
 * categoría en silencio.
 */
export async function gatherOperationalResources(
  impactArea: ImpactArea,
  profile: ThreatResourceProfile
): Promise<OperationalResourceCandidate[]> {
  const candidates: OperationalResourceCandidate[] = [];

  if (profile.resourceCategories.length > 0) {
    const pois = await getCriticalPoisNear(impactArea.anchor, impactArea.radiusKm, {
      categories: profile.resourceCategories,
    });
    for (const poi of pois) {
      candidates.push({
        id: poi.id,
        kind: "critical_poi",
        category: poi.category,
        name: poi.name,
        lat: poi.lat,
        lng: poi.lng,
        distanceKm: haversineDistanceKm(impactArea.anchor, { lat: poi.lat, lng: poi.lng }),
        priority: poi.priority,
        poi,
        providerAvailable: true,
      });
    }
  }

  for (const kind of profile.externalResourceKinds) {
    const provider = getExternalResourceProvider(kind);
    if (provider?.implemented && provider.fetch) {
      const results = await provider.fetch(impactArea);
      candidates.push(...results);
      continue;
    }
    candidates.push({
      id: `external-placeholder-${kind}`,
      kind: "external",
      category: kind,
      name: provider?.label ?? kind,
      lat: impactArea.anchor.lat,
      lng: impactArea.anchor.lng,
      distanceKm: 0,
      providerAvailable: false,
    });
  }

  return candidates;
}
