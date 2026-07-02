import { NextRequest, NextResponse } from "next/server";
import { requiresProfileCompletion } from "@/lib/identity/accountIdentityPolicy";
import { prisma } from "@/lib/prisma";
import { createLoginRedirectResponse } from "@/services/authService";
import { logAuditEvent } from "@/services/auditService";
import { formatPublicAlias } from "@/services/govIdentity/govIdentityProvider";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_STATE_COOKIE = "argus-google-oauth-state";
const GOOGLE_NEXT_COOKIE = "argus-google-oauth-next";

interface GoogleTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  id_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfo {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

function getRedirectUri(request: NextRequest) {
  return (
    process.env.GOOGLE_REDIRECT_URI ??
    `${request.nextUrl.origin}/api/auth/google/callback`
  );
}

function redirectLogin(request: NextRequest, reason: string) {
  return NextResponse.redirect(new URL(`/login?google=${reason}`, request.url));
}

export async function GET(request: NextRequest) {
  const oauthError = request.nextUrl.searchParams.get("error");
  if (oauthError) {
    return redirectLogin(
      request,
      oauthError === "redirect_uri_mismatch" ? "redirect_mismatch" : "google_error"
    );
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get(GOOGLE_STATE_COOKIE)?.value;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return redirectLogin(request, "missing_config");
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectLogin(request, "invalid_state");
  }

  try {
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: getRedirectUri(request),
        grant_type: "authorization_code",
      }),
      cache: "no-store",
    });
    const tokenPayload = (await tokenResponse.json()) as GoogleTokenResponse;

    if (!tokenResponse.ok || !tokenPayload.access_token) {
      return redirectLogin(request, "token_error");
    }

    const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
      cache: "no-store",
    });
    const userInfo = (await userInfoResponse.json()) as GoogleUserInfo;

    if (!userInfoResponse.ok || !userInfo.sub || !userInfo.email) {
      return redirectLogin(request, "profile_error");
    }

    const email = userInfo.email.trim().toLowerCase();
    const displayName = userInfo.name?.trim() || email.split("@")[0] || "Usuario ARGUS";
    const now = new Date();

    const existingByGoogleSub = await prisma.user.findUnique({
      where: { googleSub: userInfo.sub },
    });
    const existingByEmail = existingByGoogleSub
      ? null
      : await prisma.user.findUnique({ where: { email } });

    const user = existingByGoogleSub
      ? await prisma.user.update({
          where: { id: existingByGoogleSub.id },
          data: {
            name: existingByGoogleSub.name || displayName,
            avatarUrl: userInfo.picture ?? existingByGoogleSub.avatarUrl,
            emailVerifiedAt: userInfo.email_verified
              ? existingByGoogleSub.emailVerifiedAt ?? now
              : existingByGoogleSub.emailVerifiedAt,
            lastLoginAt: now,
          },
        })
      : existingByEmail
        ? await prisma.user.update({
            where: { id: existingByEmail.id },
            data: {
              googleSub: existingByEmail.googleSub ?? userInfo.sub,
              avatarUrl: userInfo.picture ?? existingByEmail.avatarUrl,
              emailVerifiedAt: userInfo.email_verified
                ? existingByEmail.emailVerifiedAt ?? now
                : existingByEmail.emailVerifiedAt,
              authProvider: existingByEmail.authProvider ?? "google",
              lastLoginAt: now,
            },
          })
        : await prisma.user.create({
            data: {
              name: displayName,
              email,
              googleSub: userInfo.sub,
              avatarUrl: userInfo.picture,
              emailVerifiedAt: userInfo.email_verified ? now : null,
              authProvider: "google",
              publicAlias: formatPublicAlias(displayName),
              role: "CITIZEN",
              accountStatus: "ACTIVE",
              lastLoginAt: now,
            },
          });

    await logAuditEvent({
      actorUserId: user.id,
      action: "LOGIN_GOOGLE",
      targetType: "User",
      targetId: user.id,
      metadata: { email, provider: "google" },
    });

    const nextPath = request.cookies.get(GOOGLE_NEXT_COOKIE)?.value ?? "/app";
    const finalPath = requiresProfileCompletion(user)
      ? `/onboarding?next=${encodeURIComponent(nextPath)}`
      : nextPath;
    const response = createLoginRedirectResponse(user.id, new URL(finalPath, request.url));
    response.cookies.set({
      name: GOOGLE_STATE_COOKIE,
      value: "",
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    response.cookies.set({
      name: GOOGLE_NEXT_COOKIE,
      value: "",
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return response;
  } catch {
    return redirectLogin(request, "callback_error");
  }
}
