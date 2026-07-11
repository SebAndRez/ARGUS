import { NextResponse } from "next/server";
import {
  runIocSlsmfContextEnrichment,
  type IocSlsmfContextJobInput,
} from "@/lib/knowledge-intake/persistence/knowledgeIngestionJobs";
import { requireOperator } from "@/lib/security/apiGuards";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { user, response: authResponse } = await requireOperator();
  if (authResponse || !user) return authResponse ?? NextResponse.json({ error: "Autenticacion requerida." }, { status: 401 });
  try {
    const body = (await request.json().catch(() => ({}))) as IocSlsmfContextJobInput;
    const result = await runIocSlsmfContextEnrichment({
      purpose: body.purpose ?? "tsunami_context",
      maxIncidents: body.maxIncidents ?? 25,
      sinceHours: body.sinceHours ?? 24,
      radiusKm: body.radiusKm ?? 100,
      minutes: body.minutes ?? 120,
      persist: body.persist ?? true,
      apiVersion: body.apiVersion ?? "v2",
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        runId: null,
        status: "failed",
        sourceId: "ioc-slsmf",
        consideredIncidents: 0,
        enrichedIncidents: 0,
        skippedAlreadyFresh: 0,
        skippedMissingCoordinates: 0,
        skippedNoNearbyStation: 0,
        skippedRequiresConfiguration: 0,
        evidenceCreated: 0,
        warnings: [],
        errors: [error instanceof Error ? error.message : "IOC SLSMF context job failed"],
        sampleContexts: [],
      },
      { status: 500 }
    );
  }
}
