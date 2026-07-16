import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function parseLimit(value: string | null) {
  const limit = Number(value ?? "50");
  return Number.isInteger(limit) ? Math.min(200, Math.max(1, limit)) : 50;
}

/**
 * `expiresAt` es una columna real (no JSON), así que el filtro de vigencia
 * se aplica directamente en la query de Prisma (Prompt 10 §9) — nunca en
 * memoria — usando el mismo instante `now` para toda la consulta.
 * `expiresAt: null` se preserva siempre (Prompt 10 §8: nulo nunca se
 * interpreta como expiración). `?includeExpired=true` permite consultar el
 * histórico completo sin filtrar, para no romper la posibilidad de una
 * vista histórica (Prompt 10 §15).
 */
export async function GET(request: NextRequest) {
  const sourceId = request.nextUrl.searchParams.get("sourceId")?.trim();
  const category = request.nextUrl.searchParams.get("category")?.trim();
  const severity = request.nextUrl.searchParams.get("severity")?.trim();
  const sinceValue = request.nextUrl.searchParams.get("since");
  const since = sinceValue ? new Date(sinceValue) : null;
  const includeExpired = request.nextUrl.searchParams.get("includeExpired") === "true";
  const now = new Date();

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
      ...(includeExpired ? {} : { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }),
    },
    orderBy: [{ occurredAt: "desc" }, { updatedAt: "desc" }],
    take: parseLimit(request.nextUrl.searchParams.get("limit")),
  });

  return NextResponse.json({
    count: events.length,
    events,
  });
}
