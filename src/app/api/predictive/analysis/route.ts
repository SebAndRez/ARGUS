import { NextRequest, NextResponse } from "next/server";
import { getPredictiveAnalyses } from "@/lib/predictive-core/predictiveFeed";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const analyses = await getPredictiveAnalyses({
    inputId: request.nextUrl.searchParams.get("inputId"),
    kind: request.nextUrl.searchParams.get("kind"),
    limit: request.nextUrl.searchParams.get("limit"),
  });

  return NextResponse.json({ analyses });
}
