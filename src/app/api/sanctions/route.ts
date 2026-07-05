import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOperator } from "@/lib/security/apiGuards";

export async function GET() {
  const { response } = await requireOperator();
  if (response) return response;

  const sanctions = await prisma.sanction.findMany({
    include: { createdBy: { select: { publicAlias: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ sanctions });
}

export async function POST(req: Request) {
  const { user, response } = await requireOperator();
  if (response || !user) return response;

  const body = await req.json();
  const userId = String(body.userId || "").trim();
  const type = String(body.type || "").trim();
  const reason = String(body.reason || "").trim();

  if (!userId || !type || !reason) {
    return NextResponse.json({ error: "userId, type y reason son requeridos." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    return NextResponse.json({ error: "Usuario objetivo no encontrado." }, { status: 404 });
  }

  const sanction = await prisma.sanction.create({
    data: {
      userId,
      type,
      reason,
      createdById: user.id,
    },
  });

  const accountStatus =
    type === "RESTORE"
      ? "ACTIVE"
      : type === "WARNING"
      ? target.accountStatus
      : type === "LIMITATION"
      ? "LIMITED"
      : type === "SUSPENSION"
      ? "SUSPENDED"
      : type === "BAN"
      ? "BANNED"
      : target.accountStatus;

  await prisma.user.update({
    where: { id: userId },
    data: {
      accountStatus,
      strikes: type === "RESTORE" ? 0 : undefined,
      updatedAt: new Date(),
    },
  });

  return NextResponse.json({ sanction });
}
