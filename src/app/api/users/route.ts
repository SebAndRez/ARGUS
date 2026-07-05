import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOperator } from "@/lib/security/apiGuards";

export async function GET() {
  const { response } = await requireOperator();
  if (response) return response;

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      publicAlias: true,
      role: true,
      accountStatus: true,
      trustScore: true,
      strikes: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ users });
}
