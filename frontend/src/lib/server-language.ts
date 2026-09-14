import "server-only";

import { cookies, headers } from "next/headers";
import { LANGUAGE_COOKIE_NAME } from "@/i18n/config";

/**
 * The visitor's language cookie on its own, ready to forward.
 *
 * Public endpoints must not receive the session cookie, so they cannot simply
 * pass the whole jar through. They still have to say which language to answer
 * in, though: the backend resolves it from this cookie, and without it every
 * server-rendered page falls back to Romanian no matter what the visitor
 * picked. Forwarding just this one name keeps both properties.
 */
export async function languageCookieHeader(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(LANGUAGE_COOKIE_NAME)?.value;

  if (!value) {
    return null;
  }

  return `${LANGUAGE_COOKIE_NAME}=${encodeURIComponent(value)}`;
}

/**
 * Accept-Language as the visitor sent it, used when no cookie has been set.
 * The backend falls back to it before defaulting to Romanian.
 */
export async function acceptLanguageHeader(): Promise<string | null> {
  const requestHeaders = await headers();
  return requestHeaders.get("accept-language");
}
