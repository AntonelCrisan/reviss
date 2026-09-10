import { getTranslations } from "next-intl/server";
const allowedRoutes = new Map([
  ["GET:me", "/api/auth/me"],
  ["POST:me/deletion-request", "/api/auth/me/deletion-request"],
  ["PATCH:me/preferences", "/api/auth/me/preferences"],
  ["POST:login", "/api/auth/login"],
  ["POST:logout", "/api/auth/logout"],
  ["POST:password-reset/confirm", "/api/auth/password-reset/confirm"],
  ["POST:password-reset/request", "/api/auth/password-reset/request"],
  ["POST:register", "/api/auth/register"],
  ["POST:verify-email", "/api/auth/verify-email"],
  ["PATCH:me/password", "/api/auth/me/password"],
  ["PATCH:me/name", "/api/auth/me/name"],
  ["POST:me/email/change-request", "/api/auth/me/email/change-request"],
  ["POST:email/confirm", "/api/auth/email/confirm"],
  [
    "POST:me/newsletter-consent/withdraw",
    "/api/auth/me/newsletter-consent/withdraw",
  ],
  ["GET:me/data-export", "/api/auth/me/data-export"],
  ["GET:me/study-preferences", "/api/auth/me/study-preferences"],
  ["PATCH:me/study-preferences", "/api/auth/me/study-preferences"],
  ["GET:me/notifications", "/api/auth/me/notifications"],
  ["POST:me/notifications/read-all", "/api/auth/me/notifications/read-all"],
  ["GET:me/usage", "/api/auth/me/usage"],
]);

const dynamicRoutes = [
  { method: "POST", pattern: /^me\/notifications\/[^/]+\/read$/ },
  { method: "DELETE", pattern: /^me\/notifications\/[^/]+$/ },
];

type AuthRouteContext = {
  params: Promise<{ path: string[] }>;
};

async function proxyAuthRequest(
  request: Request,
  context: AuthRouteContext,
): Promise<Response> {
  const { path } = await context.params;
  const action = path.join("/");
  const backendPath =
    allowedRoutes.get(`${request.method}:${action}`) ??
    (dynamicRoutes.some(
      (route) => route.method === request.method && route.pattern.test(action),
    )
      ? `/api/auth/${action}`
      : undefined);

  if (!backendPath) {
    return Response.json(
      { detail: (await getTranslations("apiRoutes"))("authRouteMissing") },
      { status: 404 },
    );
  }

  const apiUrl = process.env.API_URL;
  if (!apiUrl) {
    return Response.json(
      { detail: "API_URL nu este configurat pe serverul frontend." },
      { status: 500 },
    );
  }

  const headers = new Headers();
  for (const headerName of [
    "content-type",
    "cookie",
    "user-agent",
    "origin",
    "referer",
    "x-forwarded-for",
  ]) {
    const value = request.headers.get(headerName);
    if (value) headers.set(headerName, value);
  }

  const body = request.method === "GET" ? undefined : await request.text();
  const isDelete = request.method === "DELETE";

  async function callBackend(): Promise<Response> {
    const backendResponse = await fetch(`${apiUrl}${backendPath}`, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
    });

    const responseHeaders = new Headers();
    const responseContentType = backendResponse.headers.get("content-type");
    if (responseContentType) {
      responseHeaders.set("content-type", responseContentType);
    }
    const responseContentDisposition = backendResponse.headers.get(
      "content-disposition",
    );
    if (responseContentDisposition) {
      responseHeaders.set("content-disposition", responseContentDisposition);
    }

    const setCookies = backendResponse.headers.getSetCookie();
    for (const setCookie of setCookies) {
      responseHeaders.append("set-cookie", setCookie);
    }

    return new Response(await backendResponse.arrayBuffer(), {
      status: backendResponse.status,
      headers: responseHeaders,
    });
  }

  try {
    return await callBackend();
  } catch {
    // A dropped local connection between this proxy and the backend can
    // surface as a fetch failure even though the backend already handled
    // the request — retry once before giving up.
    try {
      const retryResponse = await callBackend();
      // DELETE is idempotent: a 404 on the retry most likely means the
      // first attempt's request actually reached the backend and deleted
      // the row, but its response never made it back here. Report the
      // success that already happened instead of a spurious failure.
      if (isDelete && retryResponse.status === 404) {
        return new Response(null, { status: 204 });
      }
      return retryResponse;
    } catch {
      return Response.json(
        { detail: "Serviciul de autentificare nu este disponibil." },
        { status: 503 },
      );
    }
  }
}

export function GET(
  request: Request,
  context: AuthRouteContext,
): Promise<Response> {
  return proxyAuthRequest(request, context);
}

export function POST(
  request: Request,
  context: AuthRouteContext,
): Promise<Response> {
  return proxyAuthRequest(request, context);
}

export function PATCH(
  request: Request,
  context: AuthRouteContext,
): Promise<Response> {
  return proxyAuthRequest(request, context);
}

export function DELETE(
  request: Request,
  context: AuthRouteContext,
): Promise<Response> {
  return proxyAuthRequest(request, context);
}
