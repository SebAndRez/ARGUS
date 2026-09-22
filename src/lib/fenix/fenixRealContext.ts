import { prisma } from "@/lib/prisma";
import { getRealFenixShelters } from "@/lib/fenix/fenixShelterSource";
import { getRealMedicalPointsNear } from "@/lib/medical/realMedicalPoints";
import type { FenixRealContext } from "@/lib/fenix/fenixSimulationEngine";

/**
 * Real context around a FÉNIX simulation origin (server-only):
 *   - shelters: `CriticalPoi` + operational status (same source as /api/fenix/shelters);
 *   - medical points: `CriticalPoi` health facilities;
 *   - relatedReportsCount: persisted citizen reports + SOS inside the projected
 *     area — a count only, never rows (the simulation output is aggregate).
 * Each part degrades independently: a failing source is left `undefined`, so
 * the engine keeps its labelled demo fallback for that part only.
 */
export async function getFenixRealContext(
  origin: { lat: number; lng: number },
  radiusKm: number
): Promise<FenixRealContext> {
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.2));
  const bbox = {
    latitude: { gte: origin.lat - latDelta, lte: origin.lat + latDelta },
    longitude: { gte: origin.lng - lngDelta, lte: origin.lng + lngDelta },
  };

  const [shelters, medicalPoints, reportCounts] = await Promise.allSettled([
    getRealFenixShelters(origin, radiusKm),
    getRealMedicalPointsNear(origin, radiusKm),
    Promise.all([prisma.report.count({ where: bbox }), prisma.helpRequest.count({ where: bbox })]),
  ]);

  return {
    shelters: shelters.status === "fulfilled" ? shelters.value : undefined,
    medicalPoints: medicalPoints.status === "fulfilled" ? medicalPoints.value.slice(0, 8) : undefined,
    relatedReportsCount:
      reportCounts.status === "fulfilled" ? reportCounts.value[0] + reportCounts.value[1] : undefined,
  };
}
