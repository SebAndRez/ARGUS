import { NextRequest, NextResponse } from "next/server";
import { runPredictiveFromBody } from "@/lib/predictive-core/predictiveFeed";
import { requireOperator } from "@/lib/security/apiGuards";

export const dynamic = "force-dynamic";

/**
 * Ad-hoc predictive run. Operator-only: the context retriever queries nearby
 * Report/HelpRequest rows for any coordinate the caller supplies, so an
 * anonymous caller could use the resulting scores to probe for SOS activity
 * around arbitrary locations (and trigger 5 DB queries per request).
 */
export async function POST(request: NextRequest) {
  const { user, response: authResponse } = await requireOperator();
  if (authResponse || !user) {
    return authResponse ?? NextResponse.json({ error: "Autenticacion requerida." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const packet = await runPredictiveFromBody(body);
    return NextResponse.json({ packet });
  } catch {
    return NextResponse.json({ error: "Payload predictivo inválido." }, { status: 400 });
  }
}
