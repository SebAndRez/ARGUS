import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const SESSION_COOKIE = "argus-grid-session";

export function createSessionCookie(userId: string) {
  const payload = { userId, issuedAt: Date.now() };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

export function parseSessionCookie(cookieValue: string) {
  try {
    const decoded = Buffer.from(cookieValue, "base64").toString("utf-8");
    return JSON.parse(decoded) as { userId: string; issuedAt: number };
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const cookieJar = await cookies();
  const cookie = cookieJar.get(SESSION_COOKIE)?.value;
  if (!cookie) return null;
  const session = parseSessionCookie(cookie);
  if (!session?.userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
  });
  return user;
}

export function createLoginResponse(data: Record<string, unknown>) {
  const response = NextResponse.json(data);
  response.cookies.set({
    name: SESSION_COOKIE,
    value: createSessionCookie(data.userId as string),
    httpOnly: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    sameSite: "lax",
  });
  return response;
}

export function createLogoutResponse() {
  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    path: "/",
    maxAge: 0,
    sameSite: "lax",
  });
  return response;
}
