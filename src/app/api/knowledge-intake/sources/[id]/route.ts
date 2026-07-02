import { NextResponse } from "next/server";
import { getSourceById } from "@/lib/knowledge-intake/sourceRegistry";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const source = getSourceById(id);
  if (!source) {
    return NextResponse.json({ error: "Knowledge source not found." }, { status: 404 });
  }
  return NextResponse.json({ source });
}
