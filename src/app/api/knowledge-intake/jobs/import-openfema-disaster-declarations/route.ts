import { NextResponse } from "next/server";
import {
  runOpenFemaDisasterDeclarationsImport,
  type OpenFemaImportJobInput,
} from "@/lib/knowledge-intake/persistence/knowledgeIngestionJobs";
import { requireOperator } from "@/lib/security/apiGuards";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { user, response: authResponse } = await requireOperator();
  if (authResponse || !user) return authResponse ?? NextResponse.json({ error: "Autenticacion requerida." }, { status: 401 });
  try {
    const body = (await request.json().catch(() => ({}))) as OpenFemaImportJobInput;
    if (!body.year && !body.state && !body.disasterNumber && !body.incidentTypes?.length) {
      return NextResponse.json(
        {
          status: "invalidRequest",
          sourceId: "openfema",
          dataset: "disaster-declarations",
          sourceRole: "disaster_declaration_recovery_dataset",
          isLiveSensor: false,
          errors: ["year, state, disasterNumber or incidentTypes is required"],
          warnings: ["Use a controlled OpenFEMA import. Full OpenFEMA bulk imports are not allowed in this phase."],
        },
        { status: 400 }
      );
    }
    const result = await runOpenFemaDisasterDeclarationsImport({
      year: body.year,
      state: body.state,
      incidentTypes: body.incidentTypes,
      declarationType: body.declarationType,
      disasterNumber: body.disasterNumber,
      limit: body.limit ?? 1000,
      skip: body.skip ?? 0,
      persist: true,
      mode: "import",
    });
    return NextResponse.json(result, { status: result.status === "failed" ? 500 : 200 });
  } catch (error) {
    return NextResponse.json(
      {
        status: "failed",
        sourceId: "openfema",
        dataset: "disaster-declarations",
        error: error instanceof Error ? error.message : "OpenFEMA import job failed",
      },
      { status: 500 }
    );
  }
}
