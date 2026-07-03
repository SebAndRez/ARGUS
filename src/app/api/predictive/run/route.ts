import { NextRequest, NextResponse } from "next/server";
import { runPredictiveFromBody } from "@/lib/predictive-core/predictiveFeed";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const packet = await runPredictiveFromBody(body);
    return NextResponse.json({ packet });
  } catch {
    return NextResponse.json({ error: "Payload predictivo inválido." }, { status: 400 });
  }
}
