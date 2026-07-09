import { NextRequest, NextResponse } from "next/server";
import { runChileAlertsIngestion } from "@/app/api/chile-alerts/run/route";

export const dynamic = "force-dynamic";

/**
 * Scheduled-job entry point (see `.github/workflows/argus-cron.yml`) for the
 * Chile official-alerts pipeline — thin alias over the same function
 * `/api/chile-alerts/run` uses, so there is one ingestion implementation,
 * not two. Triggered externally (GitHub Actions, not Vercel Cron — Vercel
 * Hobby only allows a once-a-day cron, this job needs ~15min cadence), so
 * unlike Vercel's own cron dispatcher this is a plain public URL and MUST
 * fail closed: a request is only authorized if `CRON_SECRET` is configured
 * on the server AND the request's `Authorization` header matches it exactly.
 * If `CRON_SECRET` is unset, every request is rejected — never fall back to
 * "unset secret means open".
 */
function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
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
    // Deliberately return only `error.message`, never the raw `error` object
    // or the request's Authorization header — avoids leaking upstream
    // response bodies (which could echo back request details) or secrets
    // into the client response or, by extension, into any log that
    // captures response bodies.
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
