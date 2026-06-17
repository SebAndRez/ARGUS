import { NextResponse } from "next/server";
import { getCurrentUser } from "@/services/authService";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      publicAlias: user.publicAlias,
      role: user.role,
      accountStatus: user.accountStatus,
      trustScore: user.trustScore,
      strikes: user.strikes,
    },
  });
}
