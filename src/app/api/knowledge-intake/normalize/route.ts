import { NextResponse } from "next/server";
import { normalizeKnowledgeInput } from "@/lib/knowledge-intake/incidentNormalizer";
import type { ArgusKnowledgeInputEnvelope } from "@/types/knowledgeIntake";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const envelope = (await request.json()) as ArgusKnowledgeInputEnvelope;
  if (!envelope?.id || !envelope.inputType || !envelope.ingestionMode) {
    return NextResponse.json({ error: "KnowledgeInputEnvelope invalido." }, { status: 400 });
  }
  return NextResponse.json({
    incident: normalizeKnowledgeInput(envelope),
    note: "Normalizacion local conservadora; requiere revision humana antes de uso operacional.",
  });
}
