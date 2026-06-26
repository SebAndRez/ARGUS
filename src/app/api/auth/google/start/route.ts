import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_STATE_COOKIE = "argus-google-oauth-state";

function getGoogleConfig(request: Request) {
  const url = new URL(request.url);

  return {
    clientId: process.env.GOOGLE_CLIENT_ID,
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI ??
      `${url.origin}/api/auth/google/callback`,
  };
}

export async function GET(request: Request) {
  const config = getGoogleConfig(request);

  if (!config.clientId) {
    return NextResponse.redirect(new URL("/login?google=missing_config", request.url));
  }

  const state = randomBytes(32).toString("hex");

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });

  const response = NextResponse.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);

  response.cookies.set({
    name: GOOGLE_STATE_COOKIE,
    value: state,
    httpOnly: true,
    maxAge: 60 * 10,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}