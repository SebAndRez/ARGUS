import { NextResponse } from "next/server";
import { runSmithsonianGvpCatalogImport, type SmithsonianGvpCatalogJobInput } from "@/lib/knowledge-intake/persistence/smithsonianGvpIngestionJobs";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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
