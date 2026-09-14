/** Keyed the same as the capacity it tops up, on both sides of the wire. */
export type AddonResourceKey =
  | "ai_credits"
  | "ocr_pages"
  | "projects"
  | "materials"
  | "pages";

export type AddonResource = {
  id: string;
  resource_key: AddonResourceKey;
  name: string;
  unit_label: string;
  description: string;
  unit_price_ron: string | number;
  min_quantity: number;
  max_quantity: number;
  step: number;
  /** False until a Stripe price is wired up, so the UI can hide the button. */
  is_purchasable: boolean;
};

export type AddonBalance = {
  projects: number;
  materials: number;
  pages: number;
  ai_credits: number;
  ocr_pages: number;
  cycle_end: string | null;
};

export type AddonOffer = {
  resources: AddonResource[];
  balance: AddonBalance;
  /** Sold on paid plans only. */
  can_purchase: boolean;
};

export type AddonPurchase = {
  id: string;
  status: string;
  amount_paid: number;
  currency: string;
  extra_projects: number;
  extra_materials: number;
  extra_pages: number;
  extra_ai_credits: number;
  extra_ocr_pages: number;
  cycle_end: string;
  created_at: string;
  paid_at: string | null;
};

export type AdminAddonResource = AddonResource & {
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  is_visible: boolean;
  sort_order: number;
};

type ApiErrorPayload = {
  detail?: string;
};

export class AddonsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AddonsApiError";
  }
}

async function addonsRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const suffix = path ? `/${path}` : "";
  const response = await fetch(`/api/addons${suffix}`, {
    ...init,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let payload: ApiErrorPayload = {};
    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      // The fallback below handles non-JSON upstream errors.
    }
    throw new AddonsApiError(
      payload.detail || "Resursele nu au putut fi încărcate.",
      response.status,
    );
  }

  return (await response.json()) as T;
}

export function getAddonOffer(): Promise<AddonOffer> {
  return addonsRequest<AddonOffer>("");
}

/**
 * Only quantities are sent. The server reads prices and bounds from its own
 * rows, so the basket cannot decide what it costs.
 */
export function createAddonCheckoutSession(
  items: Partial<Record<AddonResourceKey, number>>,
): Promise<{ checkout_url: string; session_id: string }> {
  return addonsRequest("checkout-session", {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}

export function syncAddonCheckoutSession(
  sessionId: string,
): Promise<AddonPurchase | null> {
  return addonsRequest<AddonPurchase | null>("checkout-session/sync", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export function getAdminAddonResources(): Promise<AdminAddonResource[]> {
  return addonsRequest<AdminAddonResource[]>("admin");
}

export function updateAdminAddonResources(
  resources: Array<Omit<AdminAddonResource, "is_purchasable">>,
): Promise<AdminAddonResource[]> {
  return addonsRequest<AdminAddonResource[]>("admin", {
    method: "PUT",
    body: JSON.stringify({ resources }),
  });
}
