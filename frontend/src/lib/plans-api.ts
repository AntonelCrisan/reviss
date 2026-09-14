export type SubscriptionPlanFeature = {
  id: string;
  label: string;
  sort_order: number;
};

/** Shape returned by the unauthenticated `GET /api/plans/` endpoint.
 *
 * Mirrors `SubscriptionPlanPublicResponse` on the backend. It deliberately
 * lacks the Stripe identifiers, our per-cycle OpenAI cost and the internal
 * accounting units -- `is_purchasable` stands in for "has a Stripe price".
 * Anything rendered on a public page must come from this type, not from
 * `SubscriptionPlan` below (which is admin-only).
 */
export type SubscriptionPlanPublic = {
  slug: string;
  name: string;
  price_ron: string | number;
  old_price_ron: string | number | null;
  discount_label: string | null;
  billing_interval: string;
  badge: string | null;
  description: string;
  material_limit: string;
  ai_level: string;
  storage: string;
  conditions: string;
  active_project_slots: number;
  active_project_limit: number;
  monthly_material_limit: number;
  files_per_project_limit: number;
  file_size_limit_mb: number;
  estimated_page_limit: number;
  initial_flashcard_limit: number;
  quiz_questions_per_quiz: number;
  quizzes_per_project_limit: number;
  allow_scanned_documents: boolean;
  ai_chat_enabled: boolean;
  is_featured: boolean;
  is_visible: boolean;
  sort_order: number;
  is_purchasable: boolean;
  features: SubscriptionPlanFeature[];
};

/** Full plan row, returned only by the admin endpoints. */
export type SubscriptionPlan = {
  id: string;
  slug: string;
  name: string;
  price_ron: string | number;
  old_price_ron: string | number | null;
  discount_label: string | null;
  billing_interval: string;
  badge: string | null;
  description: string;
  material_limit: string;
  ai_level: string;
  storage: string;
  conditions: string;
  active_project_slots: number;
  active_project_limit: number;
  monthly_material_limit: number;
  files_per_project_limit: number;
  file_size_limit_mb: number;
  project_size_limit_mb: number;
  estimated_page_limit: number;
  initial_flashcard_limit: number;
  quiz_questions_per_quiz: number;
  quizzes_per_project_limit: number;
  allow_scanned_documents: boolean;
  monthly_ai_credits: number;
  monthly_ocr_pages: number;
  monthly_page_limit: number;
  ai_chat_enabled: boolean;
  max_openai_cost_usd_per_cycle: string | number;
  stripe_product_id?: string | null;
  stripe_price_id?: string | null;
  is_visible: boolean;
  is_featured: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  features: SubscriptionPlanFeature[];
};

export type SubscriptionPlanFeatureUpdate = {
  id?: string | null;
  label: string;
  sort_order: number;
};

export type SubscriptionPlanUpdate = {
  id?: string | null;
  slug: string;
  name: string;
  price_ron: string;
  old_price_ron: string | null;
  discount_label: string | null;
  billing_interval: string;
  badge: string | null;
  description: string;
  material_limit: string;
  ai_level: string;
  storage: string;
  conditions: string;
  active_project_slots: number;
  active_project_limit: number;
  monthly_material_limit: number;
  files_per_project_limit: number;
  file_size_limit_mb: number;
  project_size_limit_mb: number;
  estimated_page_limit: number;
  initial_flashcard_limit: number;
  quiz_questions_per_quiz: number;
  quizzes_per_project_limit: number;
  allow_scanned_documents: boolean;
  monthly_ai_credits: number;
  monthly_ocr_pages: number;
  monthly_page_limit: number;
  ai_chat_enabled: boolean;
  max_openai_cost_usd_per_cycle: string;
  stripe_product_id?: string | null;
  stripe_price_id?: string | null;
  is_visible: boolean;
  is_featured: boolean;
  sort_order: number;
  features: SubscriptionPlanFeatureUpdate[];
};

type ApiErrorPayload = {
  detail?: string;
};

export class PlansApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PlansApiError";
  }
}

async function plansRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/plans/${path}`, {
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
    throw new PlansApiError(
      payload.detail || "Planurile nu au putut fi salvate.",
      response.status,
    );
  }

  return (await response.json()) as T;
}

export function getAdminPlans(): Promise<SubscriptionPlan[]> {
  return plansRequest<SubscriptionPlan[]>("admin");
}

export function updateAdminPlans(
  plans: SubscriptionPlanUpdate[],
): Promise<SubscriptionPlan[]> {
  return plansRequest<SubscriptionPlan[]>("admin", {
    method: "PUT",
    body: JSON.stringify({ plans }),
  });
}

export type PlanFeatureTranslationEntry = {
  feature_id: string;
  source_label: string;
  label: string;
};

/**
 * One plan's translatable copy. The `source_*` fields are the Romanian
 * original, shown beside the inputs so nobody has to translate blind; only
 * the plain fields are saved.
 */
export type PlanTranslationEntry = {
  plan_id: string;
  plan_slug: string;
  source_name: string;
  source_description: string;
  source_material_limit: string;
  source_ai_level: string;
  source_storage: string;
  source_conditions: string;
  source_badge: string | null;
  source_discount_label: string | null;
  name: string;
  description: string;
  material_limit: string;
  ai_level: string;
  storage: string;
  conditions: string;
  badge: string;
  discount_label: string;
  features: PlanFeatureTranslationEntry[];
};

export type PlanTranslations = {
  locale: string;
  plans: PlanTranslationEntry[];
};

export function getAdminPlanTranslations(
  locale: string,
): Promise<PlanTranslations> {
  return plansRequest<PlanTranslations>(`admin/translations/${locale}`);
}

export function updateAdminPlanTranslations(
  locale: string,
  plans: PlanTranslationEntry[],
): Promise<PlanTranslations> {
  return plansRequest<PlanTranslations>(`admin/translations/${locale}`, {
    method: "PUT",
    body: JSON.stringify({ plans }),
  });
}
