import { NextRequest, NextResponse } from "next/server";
import { getCommandCenterIncidents } from "@/lib/command/incidentBuilder";

export const dynamic = "force-dynamic";

/** See docs/product/ARGUS_COMMAND_CENTER_STATUS.md — no operational source connected. */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const { mode, operational, incidents } = getCommandCenterIncidents();
  const incident = incidents.find((item) => item.id === id);

  if (!incident) {
    return NextResponse.json(
      {
        error:
          mode === "demo-disabled"
            ? "No operational incident source is connected to this endpoint."
            : "Incidente no encontrado.",
        mode,
        operational,
      },
      { status: 404 }
    );
  }

  return NextResponse.json({ mode, operational, incident });
}
