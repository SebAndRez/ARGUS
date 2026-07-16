import { NextResponse } from "next/server";
import { syncCriticalPoisForBbox } from "@/lib/criticalPoi/criticalPoiOsmSync";
import { criticalPoiCategoryRegistry, isCriticalPoiCategoryId } from "@/lib/criticalPoi/criticalPoiCategoryRegistry";
import type { CriticalPoiBoundingBox, CriticalPoiCategory } from "@/lib/criticalPoi/criticalPoiTypes";
import { requireOperator } from "@/lib/security/apiGuards";
import { validateBoundingBox } from "@/lib/security/boundingBoxGuard";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";

/**
 * Ingesta OSM -> tabla `CriticalPoi` para un bbox (ciudad/region). Pensado
 * para correrse manualmente o desde un cron/job externo, no desde el
 * navegador — mismo espiritu que
 * `/api/knowledge-intake/jobs/run-osm-overpass-context`. Body:
 * `{ south, west, north, east, categories? }` (categories vacio = todas las
 * 24 categorias criticas).
 *
 * Sin consumidor automatizado confirmado (no hay workflow/script que la
 * invoque) — se restringe a sesion de operador, igual que las rutas
 * hermanas de `knowledge-intake/jobs/*`. Si en el futuro se agrega un
 * job/cron externo real, reutilizar el patron de secreto Bearer de
 * `/api/jobs/run-global-watch` (fail-closed si el secreto no esta
 * configurado) en vez de abrir esta ruta sin autenticacion.
 */

export const dynamic = "force-dynamic";

interface SyncRequestBody {
  south?: number;
  west?: number;
  north?: number;
  east?: number;
  categories?: string[];
}

export async function POST(request: Request) {
  const { user, response: authResponse } = await requireOperator();
  if (authResponse || !user) return authResponse ?? NextResponse.json({ error: "Autenticacion requerida." }, { status: 401 });

  // Rate limit before touching the body — Overpass/Prisma are the expensive
  // parts, but the quota check itself must gate everything below it.
  const rateLimitOutcome = await enforceRateLimit({
    policy: "critical_pois_sync",
    request,
    identity: { userId: user.id },
  });
  const rateLimitedResponse = rateLimitResponseForOutcome(rateLimitOutcome);
  if (rateLimitedResponse) return rateLimitedResponse;

  const body = (await request.json().catch(() => ({}))) as SyncRequestBody;
  const { south, west, north, east } = body;

  if (![south, west, north, east].every((value) => typeof value === "number" && Number.isFinite(value))) {
    return NextResponse.json({ status: "invalidRequest", error: "south/west/north/east (numeros) son requeridos." }, { status: 400 });
  }

  // Bbox format/range/area validated BEFORE Overpass is ever called — no
  // request can sync "the whole planet" in one call (Prompt 12 §19).
  const bboxValidation = validateBoundingBox({ south, west, north, east });
  if (!bboxValidation.valid) {
    return NextResponse.json({ status: "invalidRequest", error: bboxValidation.reason }, { status: 400 });
  }

  const bbox: CriticalPoiBoundingBox = { south: south as number, west: west as number, north: north as number, east: east as number };
  const requestedCategories = body.categories?.filter(isCriticalPoiCategoryId) as CriticalPoiCategory[] | undefined;
  const categories = requestedCategories?.length ? requestedCategories : criticalPoiCategoryRegistry.map((item) => item.id);

  try {
    const result = await syncCriticalPoisForBbox(bbox, categories);
    return NextResponse.json({ status: "ok", bbox, categories, ...result });
  } catch (error) {
    return NextResponse.json(
      { status: "error", bbox, categories, error: error instanceof Error ? error.message : "Sync de infraestructura critica fallo." },
      { status: 502 }
    );
  }
}
