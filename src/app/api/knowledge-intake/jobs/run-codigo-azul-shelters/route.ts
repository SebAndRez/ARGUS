import { NextResponse } from "next/server";
import { runCodigoAzulIngestion } from "@/lib/criticalPoi/criticalPoiCodigoAzulSync";
import { recordIngestionRun } from "@/lib/ingestion/persistExternalEvents";
import { requireOperator } from "@/lib/security/apiGuards";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";

/**
 * Disparo manual (operador) de la sincronizacion de albergues Codigo Azul.
 * Mismo patron que `run-usgs/route.ts` y el resto de
 * `knowledge-intake/jobs/*` — la ejecucion programada real vive en
 * `/api/jobs/run-codigo-azul-shelters` (secreto de cron), esta ruta es para
 * revision/forzado manual por un operador autenticado.
 */
export async function POST(request: Request) {
  const { user, response: authResponse } = await requireOperator();
  if (authResponse || !user) return authResponse ?? NextResponse.json({ error: "Autenticación requerida." }, { status: 401 });

  const rateLimitOutcome = await enforceRateLimit({
    policy: "codigo_azul_shelters_manual_run",
    request,
    identity: { userId: user.id },
  });
  const rateLimitedResponse = rateLimitResponseForOutcome(rateLimitOutcome);
  if (rateLimitedResponse) return rateLimitedResponse;

  const startedAt = Date.now();
  try {
    const result = await runCodigoAzulIngestion();
    await recordIngestionRun("codigo_azul", result.status, {
      count: result.recordsFetched,
      durationMs: Date.now() - startedAt,
      metadata: result,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Código Azul sync failed";
    await recordIngestionRun("codigo_azul", "failed", { error: message, durationMs: Date.now() - startedAt });
    return NextResponse.json({ status: "failed", error: message }, { status: 502 });
  }
}
