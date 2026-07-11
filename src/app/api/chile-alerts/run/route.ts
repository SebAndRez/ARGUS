import { NextRequest, NextResponse } from "next/server";
import { fetchChileOfficialAlertsRaw } from "@/lib/sources/chile/senapredProvider";
import { promoteChileOfficialAlerts } from "@/lib/incidents/alertPromotionEngine";
import { chileAlertsSeed } from "@/data/chileAlertsSeed";
import { requireOperator } from "@/lib/security/apiGuards";
import { isDemoDataAllowed } from "@/lib/security/productionGuard";

export const dynamic = "force-dynamic";

/**
 * Manual/production trigger for the Chile official-alerts pipeline: fetch
 * (or, with `?seed=true`, use the QA fixtures) -> classify -> promote into
 * persisted `KnowledgeIncident`/`KnowledgeEvidence` rows. Also the function
 * `/api/jobs/run-chile-alerts` calls for scheduled runs.
 */
export async function runChileAlertsIngestion(useSeed: boolean) {
  if (useSeed) {
    const summary = await promoteChileOfficialAlerts(chileAlertsSeed);
    return { ...summary, fetched: chileAlertsSeed.length, fetchWarnings: [] as string[], fetchErrors: [] as string[], seedMode: true };
  }

  const { alerts, warnings, errors } = await fetchChileOfficialAlertsRaw();
  const summary = await promoteChileOfficialAlerts(alerts);
  return { ...summary, fetched: alerts.length, fetchWarnings: warnings, fetchErrors: errors, seedMode: false };
}

/**
 * Manual/production trigger — writes `KnowledgeIncident`/`KnowledgeEvidence`
 * on every call. Historically public (only `/api/jobs/run-chile-alerts`,
 * its scheduled-job alias, enforced `CRON_SECRET`); P0 stabilization fix:
 * this direct route must require the same operator/admin session already
 * used by other manual mutation endpoints (`requireOperator`), never a new
 * auth mechanism. `?seed=true` is additionally fenced off in production —
 * see `isDemoDataAllowed`.
 */
export async function POST(request: NextRequest) {
  const { user, response } = await requireOperator();
  if (response || !user) return response ?? NextResponse.json({ error: "Autenticacion requerida." }, { status: 401 });

  const useSeed = request.nextUrl.searchParams.get("seed") === "true";
  if (useSeed && !isDemoDataAllowed()) {
    return NextResponse.json(
      { status: "error", error: "seed=true no esta permitido en producción." },
      { status: 403 }
    );
  }
  try {
    const result = await runChileAlertsIngestion(useSeed);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : "Chile alerts ingestion failed" },
      { status: 502 }
    );
  }
}
