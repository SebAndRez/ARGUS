import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeConnectivityStaleness } from "@/lib/connectivity/telecomConnectivityService";

export const dynamic = "force-dynamic";

/**
 * Lectura publica de conectividad de emergencia (sin auth, misma postura que
 * `/api/fenix/shelters`): la tarjeta ciudadana y el layer de mapa la
 * consumen directamente. Con `region` filtra por adminLevel1; sin filtros,
 * devuelve todas las regiones (tabla pequena, mantenida manualmente - ver
 * plan §7). `isStale` se recalcula en lectura, nunca se persiste solo por
 * consultar.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const region = searchParams.get("region");
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  const rows = await prisma.telecomConnectivityStatus.findMany({
    where: region ? { adminLevel1: region } : undefined,
    orderBy: { lastUpdatedAt: "desc" },
  });

  const now = new Date();
  const statuses = rows.map((row) => ({
    ...row,
    isStale: row.isStale || computeConnectivityStaleness({ lastUpdatedAt: row.lastUpdatedAt, now }),
  }));

  return NextResponse.json({
    count: statuses.length,
    statuses,
    queried: { region, lat, lng },
    fetchedAt: now.toISOString(),
  });
}
