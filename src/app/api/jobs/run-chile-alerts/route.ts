import { NextRequest, NextResponse } from "next/server";
import { runChileAlertsIngestion } from "@/app/api/chile-alerts/run/route";

export const dynamic = "force-dynamic";

/**
 * Scheduled-job entry point (see `vercel.json`'s cron entry) for the Chile
 * official-alerts pipeline — thin alias over the same function
 * `/api/chile-alerts/run` uses, so there is one ingestion implementation,
 * not two. Guarded by `CRON_SECRET` since, unlike the existing manual
 * `/api/knowledge-intake/jobs/*` routes, this one runs unattended.
 */
function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

async function runJob(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ status: "error", error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runChileAlertsIngestion(false);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : "Chile alerts job failed" },
      { status: 502 }
    );
  }
}

/** Vercel Cron triggers via GET. */
export async function GET(request: NextRequest) {
  return runJob(request);
}

/** Manual/other schedulers may prefer POST. */
export async function POST(request: NextRequest) {
  return runJob(request);
}
