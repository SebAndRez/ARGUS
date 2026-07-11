import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { vigiaIncidentToArgusEvent } from "@/lib/vigia/vigiaIncidentToArgusEvent";
import { VIGIA_SOURCE_REGISTRY } from "@/lib/vigia/sourceRegistry";
import { isDemoDataAllowed } from "@/lib/security/productionGuard";

export const dynamic = "force-dynamic";

/**
 * Incidentes globales persistidos por ARGUS Global Watch, convertidos a
 * `ArgusEvent` para que el mapa los renderice por la ruta existente
 * `ArgusEventLayer` (junto a las alertas Chile de `/api/chile-alerts`).
 *
 * Filtros: `?severity=critical`, `?threat=WILDFIRE` (por tag vigia),
 * `?days=7`, `?limit=200`. Por defecto excluye incidentes archivados.
 */
const VIGIA_SOURCE_IDS = VIGIA_SOURCE_REGISTRY
  .filter((source) => source.id !== "senapred_eventos") // Chile ya se sirve por /api/chile-alerts.
  .map((source) => source.id);

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const severity = params.get("severity") ?? undefined;
  const threat = params.get("threat")?.toUpperCase() ?? undefined;
  const includeDemo = params.get("includeDemo") === "true" && isDemoDataAllowed();
  const days = Math.min(Math.max(Number(params.get("days") ?? 14) || 14, 1), 60);
  const limit = Math.min(Math.max(Number(params.get("limit") ?? 200) || 200, 1), 400);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const incidents = await prisma.knowledgeIncident.findMany({
    where: {
      sourceId: { in: VIGIA_SOURCE_IDS },
      updatedAt: { gte: since },
      latitude: { not: null },
      longitude: { not: null },
      ...(severity ? { severity } : {}),
    },
    orderBy: [{ severity: "asc" }, { updatedAt: "desc" }],
    take: limit,
  });

  const events = incidents
    .map((incident) => vigiaIncidentToArgusEvent(incident))
    .filter((event): event is NonNullable<typeof event> => Boolean(event))
    .filter((event) => includeDemo || !event.isDemo)
    .filter((event) => event.status !== "archived")
    .filter((event) => !threat || event.tags?.includes(`vigia:${threat.toLowerCase()}`));

  return NextResponse.json({
    source: "argus_global_watch",
    count: events.length,
    events,
  });
}
