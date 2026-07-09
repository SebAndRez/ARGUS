import { NextRequest, NextResponse } from "next/server";
import { fetchChileOfficialAlertsRaw } from "@/lib/sources/chile/senapredProvider";
import { promoteChileOfficialAlerts } from "@/lib/incidents/alertPromotionEngine";
import { chileAlertsSeed } from "@/data/chileAlertsSeed";

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

export async function POST(request: NextRequest) {
  const useSeed = request.nextUrl.searchParams.get("seed") === "true";
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
