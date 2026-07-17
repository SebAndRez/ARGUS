import { NextResponse } from "next/server";
import { runUsgsKnowledgeIngestion } from "@/lib/knowledge-intake/persistence/knowledgeIngestionJobs";
import { requireOperator } from "@/lib/security/apiGuards";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";

type RunUsgsBody = {
  feedType?: "significant" | "day" | "week" | "relevant";
  minMagnitude?: number;
  limit?: number;
};

export async function POST(request: Request) {
  const { user, response: authResponse } = await requireOperator();
  if (authResponse || !user) return authResponse ?? NextResponse.json({ error: "Autenticacion requerida." }, { status: 401 });
  const rateLimitOutcome = await enforceRateLimit({
    policy: "knowledge_intake_job_manual_run",
    request,
    identity: { userId: user.id },
  });
  const rateLimitedResponse = rateLimitResponseForOutcome(rateLimitOutcome);
  if (rateLimitedResponse) return rateLimitedResponse;
  try {
    const body = (await request.json().catch(() => ({}))) as RunUsgsBody;
    const result = await runUsgsKnowledgeIngestion({
      feedType: body.feedType ?? "relevant",
      minMagnitude: body.minMagnitude,
      limit: body.limit,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { status: "failed", error: error instanceof Error ? error.message : "USGS job failed" },
      { status: 500 }
    );
  }
}
