import { NextResponse } from "next/server";
import { demoFenixScenarios } from "@/data/fenixDemo";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    source: "demo",
    count: demoFenixScenarios.length,
    scenarios: demoFenixScenarios,
  });
}
