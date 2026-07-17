import { NextResponse } from "next/server";
import { runNwsKnowledgeIngestion, type NwsIngestionJobInput } from "@/lib/knowledge-intake/persistence/knowledgeIngestionJobs";
import { requireOperator } from "@/lib/security/apiGuards";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";

type RunNwsBody = NwsIngestionJobInput & {
  persist?: boolean;
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
    const body = (await request.json().catch(() => ({}))) as RunNwsBody;
    const result = await runNwsKnowledgeIngestion({
      mode: body.mode ?? "alerts",
      area: body.area ?? "US",
      point: body.point,
      zone: body.zone,
      status: body.status ?? "actual",
      messageType: body.messageType,
      event: body.event,
      urgency: body.urgency,
      severity: body.severity,
      certainty: body.certainty,
      limit: body.limit ?? 100,
      persist: true,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        status: "failed",
        sourceId: "nws",
        error: error instanceof Error ? error.message : "NWS job failed",
      },
      { status: 500 }
    );
  }
}
