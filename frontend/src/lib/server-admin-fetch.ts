import "server-only";

import { cookies, headers } from "next/headers";

/**
 * Forward the caller's own session to the API.
 *
 * These pages render per request behind an admin check, so the request has to
 * carry the reader's credentials rather than any ambient service identity.
 */
export async function serverAdminHeaders(): Promise<Headers> {
  const requestHeaders = new Headers();
  const requestHeadersFromNext = await headers();
  const cookieHeader =
    requestHeadersFromNext.get("cookie") ?? (await cookies()).toString();
  const userAgent = requestHeadersFromNext.get("user-agent");

  if (cookieHeader) {
    requestHeaders.set("cookie", cookieHeader);
  }

  if (userAgent) {
    requestHeaders.set("user-agent", userAgent);
  }

  return requestHeaders;
}

/**
 * Read an admin endpoint, or null when it cannot be read.
 *
 * The pages degrade to an empty table rather than an error screen: a missing
 * counter is worth less than losing the rest of the page.
 */
export async function getAdminJson<T>(path: string): Promise<T | null> {
  const apiUrl = process.env.API_URL;
  if (!apiUrl) {
    return null;
  }

  try {
    const response = await fetch(`${apiUrl}${path}`, {
      method: "GET",
      headers: await serverAdminHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}
