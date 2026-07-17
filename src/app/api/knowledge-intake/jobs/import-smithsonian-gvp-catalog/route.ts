import { NextResponse } from "next/server";
import { runSmithsonianGvpCatalogImport, type SmithsonianGvpCatalogJobInput } from "@/lib/knowledge-intake/persistence/smithsonianGvpIngestionJobs";
import { requireOperator } from "@/lib/security/apiGuards";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";

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
    const body = (await request.json().catch(() => ({}))) as SmithsonianGvpCatalogJobInput;
    const result = await runSmithsonianGvpCatalogImport({
      includeHolocene: body.includeHolocene ?? true,
      includePleistocene: body.includePleistocene ?? false,
      includeEruptions: body.includeEruptions ?? true,
      country: body.country,
      region: body.region,
      bbox: body.bbox,
      persist: true,
      createIncidents: false,
      limit: body.limit ?? 1000,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { status: "failed", sourceId: "smithsonian-gvp", error: error instanceof Error ? error.message : "Smithsonian GVP catalog import failed" },
      { status: 500 }
    );
  }
}
