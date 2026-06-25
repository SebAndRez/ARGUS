import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { seedChileHazardSourceRegistry } from "@/lib/knowledge/seedHazardKnowledge";

export const dynamic = "force-dynamic";

function parseLimit(value: string | null) {
  const limit = Number(value ?? "50");
  return Number.isInteger(limit) ? Math.min(200, Math.max(1, limit)) : 50;
}

function parseNumber(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: NextRequest) {
  await seedChileHazardSourceRegistry();

  const hazardType = request.nextUrl.searchParams.get("hazardType")?.trim();
  const country = request.nextUrl.searchParams.get("country")?.trim();
  const region = request.nextUrl.searchParams.get("region")?.trim();
  const minMagnitude = parseNumber(
    request.nextUrl.searchParams.get("minMagnitude")
  );
  const yearFrom = parseNumber(request.nextUrl.searchParams.get("yearFrom"));
  const yearTo = parseNumber(request.nextUrl.searchParams.get("yearTo"));

  const facts = await prisma.hazardKnowledgeFact.findMany({
    where: {
      ...(hazardType ? { hazardType } : {}),
      ...(country ? { country } : {}),
      ...(region ? { region: { contains: region, mode: "insensitive" } } : {}),
      ...(minMagnitude !== null ? { magnitude: { gte: minMagnitude } } : {}),
      ...(yearFrom !== null || yearTo !== null
        ? {
            year: {
              ...(yearFrom !== null ? { gte: yearFrom } : {}),
              ...(yearTo !== null ? { lte: yearTo } : {}),
            },
          }
        : {}),
    },
    orderBy: [
      { relevanceScore: "desc" },
      { confidence: "desc" },
      { year: "desc" },
    ],
    take: parseLimit(request.nextUrl.searchParams.get("limit")),
  });

  return NextResponse.json({
    count: facts.length,
    facts,
  });
}
