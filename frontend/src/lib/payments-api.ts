import { localizedFallback } from "@/lib/client-locale";
import type { AuthUser } from "@/lib/auth-api";

type ApiErrorPayload = {
  detail?: string;
};

export type CheckoutSessionResponse = {
  checkout_url: string;
  session_id: string;
};

export type SubscriptionInvoice = {
  id: string;
  stripe_invoice_id: string;
  number: string | null;
  status: string;
  currency: string;
  amount_due: number;
  amount_paid: number;
  hosted_invoice_url: string | null;
  invoice_pdf_url: string | null;
  paid_at: string | null;
  created_at: string;
};

export type CurrentSubscription = {
  id: string;
  plan_id: string;
  plan_slug: string;
  plan_name: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
};

export type SubscriptionStatusResponse = {
  subscription: CurrentSubscription | null;
};

export type SubscriptionActionResponse = {
  user: AuthUser;
  subscription: CurrentSubscription | null;
  message: string;
};

export class PaymentsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PaymentsApiError";
  }
}

export async function createCheckoutSession(
  planSlug: string,
): Promise<CheckoutSessionResponse> {
  const response = await fetch("/api/payments/checkout-session", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ plan_slug: planSlug }),
    cache: "no-store",
  });

  if (!response.ok) {
    let payload: ApiErrorPayload = {};
    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      // Non-JSON upstream errors are handled by the fallback message.
    }

    throw new PaymentsApiError(
      payload.detail || "Sesiunea de plata nu a putut fi creata.",
      response.status,
    );
  }

  return (await response.json()) as CheckoutSessionResponse;
}

export async function syncCheckoutSession(sessionId: string): Promise<AuthUser> {
  const response = await fetch("/api/payments/checkout-session/sync", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ session_id: sessionId }),
    cache: "no-store",
  });

  if (!response.ok) {
    let payload: ApiErrorPayload = {};
    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      // Non-JSON upstream errors are handled by the fallback message.
    }

    throw new PaymentsApiError(
      payload.detail || "Sesiunea de plata nu a putut fi confirmata.",
      response.status,
    );
  }

  return (await response.json()) as AuthUser;
}

export async function listSubscriptionInvoices(): Promise<SubscriptionInvoice[]> {
  const response = await fetch("/api/payments/invoices", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });

  if (!response.ok) {
    let payload: ApiErrorPayload = {};
    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      // Non-JSON upstream errors are handled by the fallback message.
    }

    throw new PaymentsApiError(
      payload.detail || "Facturile nu au putut fi incarcate.",
      response.status,
    );
  }

  return (await response.json()) as SubscriptionInvoice[];
}

export async function getCurrentSubscription(): Promise<SubscriptionStatusResponse> {
  const response = await fetch("/api/payments/subscription", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });

  if (!response.ok) {
    let payload: ApiErrorPayload = {};
    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      // Non-JSON upstream errors are handled by the fallback message.
    }

    throw new PaymentsApiError(
      payload.detail ||
        localizedFallback({
          ro: "Abonamentul nu a putut fi încărcat.",
          en: "The subscription could not be loaded.",
          fr: "L'abonnement n'a pas pu être chargé.",
        }),
      response.status,
    );
  }

  return (await response.json()) as SubscriptionStatusResponse;
}

export async function cancelCurrentSubscription(): Promise<SubscriptionActionResponse> {
  const response = await fetch("/api/payments/subscription/cancel", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
  });

  if (!response.ok) {
    let payload: ApiErrorPayload = {};
    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      // Non-JSON upstream errors are handled by the fallback message.
    }

    throw new PaymentsApiError(
      payload.detail || "Abonamentul nu a putut fi anulat.",
      response.status,
    );
  }

  return (await response.json()) as SubscriptionActionResponse;
}

export async function resumeCurrentSubscription(): Promise<SubscriptionActionResponse> {
  const response = await fetch("/api/payments/subscription/resume", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
  });

  if (!response.ok) {
    let payload: ApiErrorPayload = {};
    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      // Non-JSON upstream errors are handled by the fallback message.
    }

    throw new PaymentsApiError(
      payload.detail ||
        localizedFallback({
          ro: "Reînnoirea abonamentului nu a putut fi reactivată.",
          en: "The subscription renewal could not be reactivated.",
          fr: "Le renouvellement de l'abonnement n'a pas pu être réactivé.",
        }),
      response.status,
    );
  }

  return (await response.json()) as SubscriptionActionResponse;
}
