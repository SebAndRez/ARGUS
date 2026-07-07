import { prisma } from "@/lib/prisma";
import type { VestaThreatType } from "@/modules/vesta/types";

const EXTERNAL_EVENT_CATEGORY_TO_THREAT: Record<string, VestaThreatType> = {
  earthquake: "earthquake",
  tsunami: "tsunami",
  wildfire: "wildfire",
  flood: "flood",
};

function earthKmDistance(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const earthRadiusKm = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sin = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(sin), Math.sqrt(1 - sin));
}

/**
 * Deriva amenazas relevantes a partir de sismos/incendios/inundaciones reales
 * ya persistidos en `ExternalEvent` cerca del usuario - datos reales, no
 * inventados - y queda como el único punto a reemplazar cuando TALOS/ORÁCULO
 * expongan un endpoint de riesgo agregado por ubicación.
 */
export async function inferNearbyRiskContexts(
  lat: number,
  lng: number,
  radiusKm = 300
): Promise<VestaThreatType[]> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  // Bounding box pre-filter so the `take` cap can't drop the events that are
  // actually nearby in favor of arbitrary far-away rows returned first.
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  const candidates = await prisma.externalEvent.findMany({
    where: {
      category: { in: Object.keys(EXTERNAL_EVENT_CATEGORY_TO_THREAT) },
      occurredAt: { gte: since },
      latitude: { gte: lat - latDelta, lte: lat + latDelta },
      longitude: { gte: lng - lngDelta, lte: lng + lngDelta },
    },
    select: { category: true, latitude: true, longitude: true },
    take: 300,
  });

  const found = new Set<VestaThreatType>();
  for (const event of candidates) {
    if (event.latitude === null || event.longitude === null) continue;
    const distanceKm = earthKmDistance({ lat, lng }, { lat: event.latitude, lng: event.longitude });
    if (distanceKm <= radiusKm) {
      const threat = EXTERNAL_EVENT_CATEGORY_TO_THREAT[event.category];
      if (threat) found.add(threat);
    }
  }
  return Array.from(found);
}
