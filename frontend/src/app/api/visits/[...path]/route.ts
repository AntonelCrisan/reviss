import { getTranslations } from "next-intl/server";
const allowedRoutes = new Map([["POST:ping", "/api/visits/ping"]]);

type VisitsRouteContext = {
  params: Promise<{ path: string[] }>;
};

async function proxyVisitsRequest(
  request: Request,
  context: VisitsRouteContext,
): Promise<Response> {
  const { path } = await context.params;
  const action = path.join("/");
  const backendPath = allowedRoutes.get(`${request.method}:${action}`);

  if (!backendPath) {
    return Response.json(
      { detail: (await getTranslations("apiRoutes"))("visitsRouteMissing") },
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
      { detail: "Serviciul de vizite nu este disponibil." },
      { status: 503 },
    );
  }
}

export function POST(
  request: Request,
  context: VisitsRouteContext,
): Promise<Response> {
  return proxyVisitsRequest(request, context);
}
