import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/lib/security/apiGuards";
import { buildCanonicalIncidentPreview } from "@/lib/canonical/canonicalReadLayer";
import { isDemoDataAllowed } from "@/lib/security/productionGuard";

export const dynamic = "force-dynamic";

/**
 * Fase B — vista previa interna de la capa canónica de lectura
 * (`docs/architecture/ARGUS_INCIDENT_MIGRATION_PLAN.md` §2). Combina, sin
 * escribir nada, los incidentes de `KnowledgeIncident` (vía el mapeador
 * canónico único) con `Report`/`HelpRequest` correlacionados espacio-
 * temporalmente. No reemplaza `/api/vigia/events`, `/api/chile-alerts` ni
 * `/api/events` — es un endpoint de solo lectura, no documentado
 * públicamente, gateado a OPERATOR+ y detrás del flag
 * `CANONICAL_READ_LAYER_ENABLED` (por defecto deshabilitado, como especifica
 * el plan de migración: "por defecto false hasta validar").
 */
export async function GET(request: NextRequest) {
  if (process.env.CANONICAL_READ_LAYER_ENABLED !== "true") {
    return NextResponse.json(
      { error: "La capa canónica de lectura (Fase B) no está habilitada en este entorno." },
      { status: 404 }
    );
  }

  const { user, response } = await requireOperator();
  if (response || !user) return response;

  const params = request.nextUrl.searchParams;
  const includeDemo = params.get("includeDemo") === "true" && isDemoDataAllowed();
  const days = Math.min(Math.max(Number(params.get("days") ?? 7) || 7, 1), 30);
  const limit = Math.min(Math.max(Number(params.get("limit") ?? 200) || 200, 1), 400);
  const now = new Date();
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const preview = await buildCanonicalIncidentPreview({ since, now, includeDemo, limit });

  return NextResponse.json(preview);
}
