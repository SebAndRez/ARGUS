import { NextResponse } from "next/server";
import { runSmithsonianGvpActivityReports, type SmithsonianGvpActivityJobInput } from "@/lib/knowledge-intake/persistence/smithsonianGvpIngestionJobs";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as SmithsonianGvpActivityJobInput;
    const result = await runSmithsonianGvpActivityReports({
      includeDVAR: body.includeDVAR ?? true,
      includeWVAR: body.includeWVAR ?? true,
      sinceDays: body.sinceDays ?? 14,
      persist: body.persist ?? true,
      createIncidents: body.createIncidents ?? false,
      limit: body.limit ?? 100,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { status: "failed", sourceId: "smithsonian-gvp", error: error instanceof Error ? error.message : "Smithsonian GVP activity job failed" },
      { status: 500 }
    );
  }
}
