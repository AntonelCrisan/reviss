import { getTranslations } from "next-intl/server";
import { NextResponse } from "next/server";
import { siteUrl } from "@/lib/seo";

const STATE_COOKIE = "google_oauth_state";
const NEXT_COOKIE = "google_oauth_next";
const STATE_COOKIE_MAX_AGE_SECONDS = 600;

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/myaccount";
  }

  if (value.startsWith("/api/")) {
    return "/myaccount";
  }

  return value;
}

export async function GET(request: Request): Promise<Response> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return Response.json(
      { detail: (await getTranslations("apiRoutes"))("googleNotConfigured") },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const nextPath = safeNextPath(url.searchParams.get("next"));
  const state = crypto.randomUUID();
  const redirectUri = `${siteUrl}/api/auth/google/callback`;

  const googleUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  googleUrl.searchParams.set("client_id", clientId);
  googleUrl.searchParams.set("redirect_uri", redirectUri);
  googleUrl.searchParams.set("response_type", "code");
  googleUrl.searchParams.set("scope", "openid email profile");
  googleUrl.searchParams.set("state", state);
  googleUrl.searchParams.set("prompt", "select_account");

  const response = NextResponse.redirect(googleUrl.toString());
  const isHttps = url.protocol === "https:";
  const cookieOptions = {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax" as const,
    path: "/",
    maxAge: STATE_COOKIE_MAX_AGE_SECONDS,
  };

  response.cookies.set(STATE_COOKIE, state, cookieOptions);
  response.cookies.set(NEXT_COOKIE, nextPath, cookieOptions);

  return response;
}
