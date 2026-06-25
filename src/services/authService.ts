import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const SESSION_COOKIE = "argus-grid-session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export function createSessionCookie(userId: string) {
  const payload = { userId, issuedAt: Date.now() };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const secret = process.env.AUTH_SECRET ?? process.env.SESSION_SECRET;
  if (!secret) return encoded;

  return `${encoded}.${signSessionPayload(encoded, secret)}`;
}

export function parseSessionCookie(cookieValue: string) {
  try {
    const [encoded, signature] = cookieValue.split(".");
    const secret = process.env.AUTH_SECRET ?? process.env.SESSION_SECRET;

    if (signature && secret && !isValidSignature(encoded, signature, secret)) {
      return null;
    }

    const decoded = Buffer.from(encoded, "base64url").toString("utf-8");
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
  setSessionCookie(response, data.userId as string);
  return response;
}

export function createLoginRedirectResponse(userId: string, redirectUrl: string | URL) {
  const response = NextResponse.redirect(redirectUrl);
  setSessionCookie(response, userId);
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

function setSessionCookie(response: NextResponse, userId: string) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: createSessionCookie(userId),
    httpOnly: true,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

function signSessionPayload(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function isValidSignature(payload: string, signature: string, secret: string) {
  const expected = signSessionPayload(payload, secret);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
