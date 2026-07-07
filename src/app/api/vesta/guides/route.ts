import { NextResponse } from "next/server";
import { VESTA_THREAT_GUIDES } from "@/modules/vesta/data";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json({ guides: VESTA_THREAT_GUIDES });
}
