import { genericErrorFallback } from "@/lib/client-locale";
export type Usage = {
  projects_used: number;
  projects_limit: number;
  materials_used: number;
  materials_limit: number;
  pages_processed: number;
  pages_limit: number;
  ai_credits_used: number;
  ai_credits_limit: number;
  ocr_pages_used: number;
  ocr_pages_limit: number;
  reset_date: string;
};

type ApiErrorPayload = {
  detail?: string | Array<{ msg?: string }>;
};

export class UsageApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "UsageApiError";
  }
}

function extractErrorMessage(payload: ApiErrorPayload): string {
  if (typeof payload.detail === "string") {
    return payload.detail;
  }

  if (Array.isArray(payload.detail)) {
    const firstMessage = payload.detail.find((item) => item.msg)?.msg;
    if (firstMessage) return firstMessage;
  }

  return genericErrorFallback();
}

export async function getUsage(): Promise<Usage> {
  const response = await fetch("/api/auth/me/usage", {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    let payload: ApiErrorPayload = {};
    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      // The fallback below handles non-JSON upstream errors.
    }
    throw new UsageApiError(extractErrorMessage(payload), response.status);
  }

  return (await response.json()) as Usage;
}
