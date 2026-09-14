const allowedRoutes = [
  { method: "GET", pattern: /^company-data$/ },
  { method: "GET", pattern: /^documents\/[^/]+$/ },
  { method: "GET", pattern: /^admin\/company-data$/ },
  { method: "PUT", pattern: /^admin\/company-data$/ },
  { method: "GET", pattern: /^admin\/documents\/[^/]+$/ },
  { method: "POST", pattern: /^admin\/documents\/[^/]+\/sections$/ },
  { method: "PATCH", pattern: /^admin\/documents\/[^/]+\/sections\/[^/]+$/ },
  { method: "DELETE", pattern: /^admin\/documents\/[^/]+\/sections\/[^/]+$/ },
];

type LegalRouteContext = {
  params: Promise<{ path: string[] }>;
};

function isAllowedRoute(method: string, action: string) {
  return allowedRoutes.some(
    (route) => route.method === method && route.pattern.test(action),
  );
}

async function proxyLegalRequest(
  request: Request,
  context: LegalRouteContext,
): Promise<Response> {
  const { path } = await context.params;
  const action = path.join("/");

  if (!isAllowedRoute(request.method, action)) {
    return Response.json(
      { detail: "Ruta legala nu exista." },
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
  for (const headerName of ["content-type", "cookie", "user-agent"]) {
    const value = request.headers.get(headerName);
    if (value) headers.set(headerName, value);
  }

  try {
    // The query string carries ?locale=, which selects the language a
    // document is read and written in. Dropping it would silently send
    // every edit to the Romanian original.
    const queryString = new URL(request.url).search;
    const backendResponse = await fetch(
      `${apiUrl}/api/legal/${action}${queryString}`,
      {
        method: request.method,
        headers,
        body:
          request.method === "GET" ? undefined : await request.text(),
        cache: "no-store",
      },
    );

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
      { detail: "Serviciul legal nu este disponibil." },
      { status: 503 },
    );
  }
}

export function GET(
  request: Request,
  context: LegalRouteContext,
): Promise<Response> {
  return proxyLegalRequest(request, context);
}

export function PUT(
  request: Request,
  context: LegalRouteContext,
): Promise<Response> {
  return proxyLegalRequest(request, context);
}

export function POST(
  request: Request,
  context: LegalRouteContext,
): Promise<Response> {
  return proxyLegalRequest(request, context);
}

export function PATCH(
  request: Request,
  context: LegalRouteContext,
): Promise<Response> {
  return proxyLegalRequest(request, context);
}

export function DELETE(
  request: Request,
  context: LegalRouteContext,
): Promise<Response> {
  return proxyLegalRequest(request, context);
}
