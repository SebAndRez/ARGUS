import { NextRequest, NextResponse } from "next/server";
import { buildSourceIntelligencePlan, type RouterPurpose } from "@/lib/source-router/sourceIntelligenceRouter";
import type { UserMode } from "@/lib/source-governance/sourceRoles";

export const dynamic = "force-dynamic";

const PURPOSES = new Set(["confirm_event", "enrich_impact", "historical_context", "infrastructure_context", "forecast_risk", "osint_review", "map_layers", "run_all"]);

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as {
    purpose?: RouterPurpose;
    module?: "knowledge_intake" | "risk" | "fenix" | "nav" | "aura" | "command_center" | "citizen_map";
    userMode?: UserMode;
    hazardType?: string;
    sourceIds?: string[];
    context?: Record<string, boolean | string>;
    flags?: Record<string, boolean>;
  };
  const purpose = PURPOSES.has(body.purpose ?? "") ? body.purpose as RouterPurpose : "confirm_event";

  return NextResponse.json({
    status: "ok",
    plan: buildSourceIntelligencePlan({
      purpose,
      module: body.module,
      userMode: body.userMode,
      hazardType: body.hazardType,
      sourceIds: body.sourceIds,
      context: body.context,
      flags: body.flags,
    }),
  });
}

export async function GET(request: NextRequest) {
  const purposeParam = request.nextUrl.searchParams.get("purpose");
  const purpose = PURPOSES.has(purposeParam ?? "") ? purposeParam as RouterPurpose : "confirm_event";
  const sourceIds = request.nextUrl.searchParams.get("sourceIds")?.split(",").map((item) => item.trim()).filter(Boolean);

  return NextResponse.json({
    status: "ok",
    plan: buildSourceIntelligencePlan({
      purpose,
      module: request.nextUrl.searchParams.get("module") as never,
      userMode: (request.nextUrl.searchParams.get("userMode") as UserMode | null) ?? "command_center",
      hazardType: request.nextUrl.searchParams.get("hazardType") ?? undefined,
      sourceIds,
      context: {
        hasAoi: request.nextUrl.searchParams.get("hasAoi") === "true",
        hasActiveIncident: request.nextUrl.searchParams.get("hasActiveIncident") === "true",
        hasSelectedIncident: request.nextUrl.searchParams.get("hasSelectedIncident") === "true",
        hasRoute: request.nextUrl.searchParams.get("hasRoute") === "true",
        hasSimulation: request.nextUrl.searchParams.get("hasSimulation") === "true",
      },
    }),
  });
}
