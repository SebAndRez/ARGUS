import { NextRequest, NextResponse } from "next/server";
import { buildDemoIncidents } from "@/lib/command/incidentBuilder";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const incident = buildDemoIncidents().find((item) => item.id === id);

  if (!incident) {
    return NextResponse.json({ error: "Incidente no encontrado." }, { status: 404 });
  }

  return NextResponse.json({ incident });
}
