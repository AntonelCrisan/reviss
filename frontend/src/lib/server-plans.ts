import "server-only";

import { cookies, headers } from "next/headers";
import type {
  SubscriptionPlan,
  SubscriptionPlanPublic,
} from "@/lib/plans-api";

/** Used when the API is unreachable. Public shape: no Stripe ids, no costs. */
export const fallbackSubscriptionPlans: SubscriptionPlanPublic[] = [
  {
    slug: "start",
    name: "Beginner",
    price_ron: "0.00",
    old_price_ron: null,
    discount_label: null,
    billing_interval: "lunar",
    badge: "gratuit",
    description: "Pentru primul curs și testarea fluxului Reviss.",
    material_limit: "3 materiale procesate lunar",
    ai_level: "AI de bază",
    storage: "Istoric limitat",
    conditions:
      "Potrivit pentru testarea fluxului. Documentele scanate sau OCR nu sunt incluse in acest plan.",
    active_project_slots: 2,
    active_project_limit: 1,
    monthly_material_limit: 3,
    files_per_project_limit: 2,
    file_size_limit_mb: 10,
    estimated_page_limit: 25,
    initial_flashcard_limit: 20,
    quiz_questions_per_quiz: 8,
    quizzes_per_project_limit: 3,
    allow_scanned_documents: false,
    ai_chat_enabled: false,
    is_visible: true,
    is_featured: false,
    sort_order: 0,
    is_purchasable: false,
    features: [
      {
        id: "fallback-start-1",
        label: "Flashcard-uri și quiz-uri de bază",
        sort_order: 0,
      },
      {
        id: "fallback-start-2",
        label: "Rezumat generat pentru fiecare material",
        sort_order: 1,
      },
      {
        id: "fallback-start-3",
        label: "Acces la progresul general",
        sort_order: 2,
      },
    ],
  },
  {
    slug: "focus",
    name: "Focus",
    price_ron: "29.00",
    old_price_ron: "39.00",
    discount_label: "25% reducere lansare",
    billing_interval: "lunar",
    badge: "recomandat",
    description: "Cel mai bun raport pentru studenți activi.",
    material_limit: "30 materiale procesate lunar",
    ai_level: "Repetiție inteligentă și strategii AI",
    storage: "Istoric complet pe proiecte",
    conditions:
      "Pentru utilizare individuala activa. Limitele sunt lunare si se reseteaza automat.",
    active_project_slots: 10,
    active_project_limit: 10,
    monthly_material_limit: 30,
    files_per_project_limit: 10,
    file_size_limit_mb: 50,
    estimated_page_limit: 200,
    initial_flashcard_limit: 40,
    quiz_questions_per_quiz: 12,
    quizzes_per_project_limit: 10,
    allow_scanned_documents: false,
    ai_chat_enabled: true,
    is_visible: true,
    is_featured: true,
    sort_order: 1,
    is_purchasable: false,
    features: [
      {
        id: "fallback-focus-1",
        label: "Analiză de progres pe fiecare proiect",
        sort_order: 0,
      },
      {
        id: "fallback-focus-2",
        label: "Prioritate la generare",
        sort_order: 1,
      },
      {
        id: "fallback-focus-3",
        label: "Chat AI contextual pe proiect",
        sort_order: 2,
      },
      {
        id: "fallback-focus-4",
        label: "Highlight-uri și explicații AI",
        sort_order: 3,
      },
    ],
  },
  {
    slug: "pro",
    name: "Pro",
    price_ron: "59.00",
    old_price_ron: "79.00",
    discount_label: "20 RON economie",
    billing_interval: "lunar",
    badge: "examene",
    description: "Pentru sesiuni intense și mai multe materii.",
    material_limit: "Materiale nelimitate rezonabil",
    ai_level: "Planuri AI pentru examene",
    storage: "Export și arhivă extinsă",
    conditions:
      "Pentru sesiuni intense si volume mari rezonabile. Utilizarea trebuie sa ramana educationala si individuala.",
    active_project_slots: 40,
    active_project_limit: 50,
    monthly_material_limit: 100,
    files_per_project_limit: 30,
    file_size_limit_mb: 150,
    estimated_page_limit: 500,
    initial_flashcard_limit: 50,
    quiz_questions_per_quiz: 12,
    quizzes_per_project_limit: 25,
    allow_scanned_documents: true,
    ai_chat_enabled: true,
    is_visible: true,
    is_featured: false,
    sort_order: 2,
    is_purchasable: false,
    features: [
      {
        id: "fallback-pro-1",
        label: "Planuri de învățare pe data examenului",
        sort_order: 0,
      },
      {
        id: "fallback-pro-2",
        label: "Export pentru rezumate și flashcard-uri",
        sort_order: 1,
      },
      {
        id: "fallback-pro-3",
        label: "Suport prioritar",
        sort_order: 2,
      },
      {
        id: "fallback-pro-4",
        label: "Predicții avansate de pregătire",
        sort_order: 3,
      },
    ],
  },
];

/** Internal columns the public fallback deliberately omits, per slug.
 *
 * Mirrors DEFAULT_PLANS in backend/app/api/routes/plans.py so the admin editor
 * degrades to the same values it always did when the API is unreachable.
 */
const fallbackAdminInternals: Record<
  string,
  Pick<
    SubscriptionPlan,
    | "id"
    | "project_size_limit_mb"
    | "monthly_ai_credits"
    | "monthly_ocr_pages"
    | "monthly_page_limit"
    | "max_openai_cost_usd_per_cycle"
  >
> = {
  start: {
    id: "fallback-start",
    project_size_limit_mb: 20,
    monthly_ai_credits: 10,
    monthly_ocr_pages: 0,
    monthly_page_limit: 40,
    max_openai_cost_usd_per_cycle: "2.00",
  },
  focus: {
    id: "fallback-focus",
    project_size_limit_mb: 200,
    monthly_ai_credits: 60,
    monthly_ocr_pages: 200,
    monthly_page_limit: 1000,
    max_openai_cost_usd_per_cycle: "6.00",
  },
  pro: {
    id: "fallback-pro",
    project_size_limit_mb: 500,
    monthly_ai_credits: 120,
    monthly_ocr_pages: 500,
    monthly_page_limit: 2500,
    max_openai_cost_usd_per_cycle: "12.00",
  },
};

export const fallbackAdminSubscriptionPlans: SubscriptionPlan[] =
  fallbackSubscriptionPlans.map((plan) => {
    const internals = fallbackAdminInternals[plan.slug];
    const epoch = new Date(0).toISOString();

    return {
      ...plan,
      id: internals?.id ?? `fallback-${plan.slug}`,
      project_size_limit_mb: internals?.project_size_limit_mb ?? 20,
      monthly_ai_credits: internals?.monthly_ai_credits ?? 0,
      monthly_ocr_pages: internals?.monthly_ocr_pages ?? 0,
      monthly_page_limit: internals?.monthly_page_limit ?? 0,
      max_openai_cost_usd_per_cycle:
        internals?.max_openai_cost_usd_per_cycle ?? "0.00",
      stripe_product_id: null,
      stripe_price_id: null,
      created_at: epoch,
      updated_at: epoch,
    };
  });

async function requestHeaders(includeAuth: boolean) {
  const requestHeaders = new Headers();
  const requestHeadersFromNext = await headers();
  const userAgent = requestHeadersFromNext.get("user-agent");

  if (includeAuth) {
    const cookieHeader =
      requestHeadersFromNext.get("cookie") ?? (await cookies()).toString();
    if (cookieHeader) {
      requestHeaders.set("cookie", cookieHeader);
    }
  }

  if (userAgent) {
    requestHeaders.set("user-agent", userAgent);
  }

  return requestHeaders;
}

async function serverPlansRequest<T>(
  path: string,
  options: { includeAuth?: boolean } = {},
): Promise<T | null> {
  // Read the request headers first: they are a dynamic API, so touching them
  // unconditionally keeps every caller out of static prerendering. Returning
  // early on a missing base URL used to skip this, which let pages that render
  // plans be baked at build time with the fallback prices below.
  const forwardedHeaders = await requestHeaders(Boolean(options.includeAuth));

  const baseUrl = (process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL)
    ?.trim()
    .replace(/\/+$/, "");
  if (!baseUrl) {
    return null;
  }
  const routePath = path ? `/${path}` : "/";

  try {
    const response = await fetch(`${baseUrl}/api/plans${routePath}`, {
      method: "GET",
      headers: forwardedHeaders,
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

export function getServerAdminPlans(): Promise<SubscriptionPlan[] | null> {
  return serverPlansRequest<SubscriptionPlan[]>("admin", { includeAuth: true });
}

export function getServerPublicPlans(): Promise<
  SubscriptionPlanPublic[] | null
> {
  return serverPlansRequest<SubscriptionPlanPublic[]>("");
}
