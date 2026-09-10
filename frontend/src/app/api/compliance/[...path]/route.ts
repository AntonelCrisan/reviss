import { getTranslations } from "next-intl/server";
const allowedRoutes = new Map([
  ["POST:cookie-consent", "/api/compliance/cookie-consent"],
  ["POST:contact", "/api/compliance/contact"],
  ["POST:withdrawal", "/api/compliance/withdrawal"],
  ["POST:content-report", "/api/compliance/content-report"],
  ["POST:subscription-cancel", "/api/compliance/subscription-cancel"],
]);

type ComplianceRouteContext = {
  params: Promise<{ path: string[] }>;
};

async function proxyComplianceRequest(
  request: Request,
  context: ComplianceRouteContext,
): Promise<Response> {
  const { path } = await context.params;
  const action = path.join("/");
  const backendPath = allowedRoutes.get(`${request.method}:${action}`);

  if (!backendPath) {
    return Response.json(
      { detail: (await getTranslations("apiRoutes"))("complianceRouteMissing") },
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
    "x-reviss-form-intent",
    "x-forwarded-for",
  ]) {
    const value = request.headers.get(headerName);
    if (value) headers.set(headerName, value);
  }

  try {
    const backendResponse = await fetch(`${apiUrl}${backendPath}`, {
      method: request.method,
      headers,
      body: await request.arrayBuffer(),
      cache: "no-store",
    });

    const responseHeaders = new Headers();
    const responseContentType = backendResponse.headers.get("content-type");
    if (responseContentType) {
      responseHeaders.set("content-type", responseContentType);
    }

    return new Response(await backendResponse.arrayBuffer(), {
      status: backendResponse.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      { detail: "Serviciul de conformitate nu este disponibil." },
      { status: 503 },
    );
  }
}

export function POST(
  request: Request,
  context: ComplianceRouteContext,
): Promise<Response> {
  return proxyComplianceRequest(request, context);
}
