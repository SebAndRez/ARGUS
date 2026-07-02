import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "argus-grid-session";

const protectedPrefixes = [
  "/app",
  "/dashboard",
  "/profile",
  "/onboarding",
];

const publicPrefixes = [
  "/",
  "/login",
  "/register",
  "/legal",
  "/app/como-usar",
  "/api",
  "/_next",
  "/favicon.ico",
  "/manifest.webmanifest",
];

function isProtectedPath(pathname: string) {
  if (pathname === "/app/como-usar") return false;
  return protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isPublicAsset(pathname: string) {
  return publicPrefixes.some((prefix) => {
    if (prefix === "/") return pathname === "/";
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!isProtectedPath(pathname) || isPublicAsset(pathname)) return NextResponse.next();

  const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (sessionCookie) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
