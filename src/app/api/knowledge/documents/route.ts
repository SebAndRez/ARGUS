import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { seedChileHazardSourceRegistry } from "@/lib/knowledge/seedHazardKnowledge";

export const dynamic = "force-dynamic";

function parseLimit(value: string | null) {
  const limit = Number(value ?? "50");
  return Number.isInteger(limit) ? Math.min(200, Math.max(1, limit)) : 50;
}

function parsePriority(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export async function GET(request: NextRequest) {
  await seedChileHazardSourceRegistry();

  const hazardType = request.nextUrl.searchParams.get("hazardType")?.trim();
  const country = request.nextUrl.searchParams.get("country")?.trim();
  const documentCategory = request.nextUrl.searchParams
    .get("documentCategory")
    ?.trim();
  const ingestionStatus = request.nextUrl.searchParams
    .get("ingestionStatus")
    ?.trim();
  const priority = parsePriority(request.nextUrl.searchParams.get("priority"));

  const documents = await prisma.hazardKnowledgeDocument.findMany({
    where: {
      ...(hazardType
        ? {
            OR: [
              { hazardType },
              { hazardTypes: { array_contains: [hazardType] } },
            ],
          }
        : {}),
      ...(country
        ? {
            OR: [{ country }, { countryFocus: { contains: country, mode: "insensitive" } }],
          }
        : {}),
      ...(documentCategory ? { documentCategory } : {}),
      ...(ingestionStatus ? { ingestionStatus } : {}),
      ...(priority !== null ? { priority } : {}),
    },
    orderBy: [
      { priority: "asc" },
      { reliabilityScore: "desc" },
      { updatedAt: "desc" },
    ],
    take: parseLimit(request.nextUrl.searchParams.get("limit")),
  });

  return NextResponse.json({
    count: documents.length,
    documents,
  });
}
