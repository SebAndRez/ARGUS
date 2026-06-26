import { NextResponse } from "next/server";
import { getCommandSourceHealth } from "@/lib/command/sourceHealthService";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    sources: getCommandSourceHealth(),
  });
}
