import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function parseLimit(value: string | null) {
  const limit = Number(value ?? "50");
  return Number.isInteger(limit) ? Math.min(200, Math.max(1, limit)) : 50;
}

export async function GET(request: NextRequest) {
  const sourceId = request.nextUrl.searchParams.get("sourceId")?.trim();
  const category = request.nextUrl.searchParams.get("category")?.trim();
  const severity = request.nextUrl.searchParams.get("severity")?.trim();
  const sinceValue = request.nextUrl.searchParams.get("since");
  const since = sinceValue ? new Date(sinceValue) : null;

  if (since && Number.isNaN(since.getTime())) {
    return NextResponse.json(
      { error: "since debe ser una fecha ISO válida." },
      { status: 400 }
    );
  }

  const events = await prisma.externalEvent.findMany({
    where: {
      ...(sourceId ? { sourceId } : {}),
      ...(category ? { category } : {}),
      ...(severity ? { severity } : {}),
      ...(since ? { occurredAt: { gte: since } } : {}),
    },
    orderBy: [{ occurredAt: "desc" }, { updatedAt: "desc" }],
    take: parseLimit(request.nextUrl.searchParams.get("limit")),
  });

  return NextResponse.json({
    count: events.length,
    events,
  });
}
