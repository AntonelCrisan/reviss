export type AdminUserSessionStatus = "activă" | "expirată" | "revocată";

export type AdminUserSession = {
  id: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  status: AdminUserSessionStatus;
  user_agent: string | null;
  ip_address: string | null;
};

export type AdminUserManualGrant = {
  id: string;
  plan_slug: string;
  plan_name: string;
  reason: string;
  granted_by_email: string | null;
  created_at: string;
};

export type AdminUserSubscription = {
  current_plan_slug: string | null;
  current_plan_name: string | null;
  current_plan_price_ron: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string | null;
  cancel_at_period_end: boolean;
  current_period_start: string | null;
  current_period_end: string | null;
  canceled_at: string | null;
  manual_grant: AdminUserManualGrant | null;
};

export type AdminSubscriptionActionResult = {
  subscription: AdminUserSubscription;
  message: string;
};

export type AdminUserUsageEntry = {
  used: number;
  limit: number;
};

export type AdminUserUsage = {
  plan_slug: string | null;
  plan_name: string | null;
  cycle_reset_at: string;
  projects: {
    total: number;
    active: number;
    deactivated: number;
    archived: number;
  };
  monthly_projects: AdminUserUsageEntry;
  monthly_materials: AdminUserUsageEntry;
  monthly_pages: AdminUserUsageEntry;
  ai_credits: AdminUserUsageEntry;
  ocr_pages: AdminUserUsageEntry;
  active_project_slots: number;
  files_per_project_limit: number;
  file_size_limit_mb: number;
  project_size_limit_mb: number;
  quizzes_per_project_limit: number;
  allow_scanned_documents: boolean;
};

export type AdminUser = {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  role: "admin" | "user";
  created_at: string;
  updated_at: string;
  terms_accepted_at: string;
  terms_version: string;
  newsletter_consent: boolean;
  newsletter_consent_at: string | null;
  theme_preference: "light" | "dark" | "system";
  total_sessions: number;
  active_sessions: number;
  last_session_at: string | null;
  last_seen_at: string | null;
  sessions: AdminUserSession[];
  subscription: AdminUserSubscription;
};

type ApiErrorPayload = {
  detail?: string;
};

type AdminUsersRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
};

export class AdminUsersApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AdminUsersApiError";
  }
}

async function adminUsersRequest<T>(
  path: string,
  options: AdminUsersRequestOptions = {},
): Promise<T> {
  const response = await fetch(`/api/admin/${path}`, {
    method: options.method ?? "GET",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });

  if (!response.ok) {
    let payload: ApiErrorPayload = {};
    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      // The fallback below handles non-JSON upstream errors.
    }
    throw new AdminUsersApiError(
      payload.detail || "Utilizatorii nu au putut fi încărcați.",
      response.status,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function getAdminUsers(): Promise<AdminUser[]> {
  return adminUsersRequest<AdminUser[]>("users");
}

export function updateAdminUser(
  userId: string,
  payload: Partial<Pick<AdminUser, "role" | "is_active">>,
): Promise<AdminUser> {
  return adminUsersRequest<AdminUser>(`users/${userId}`, {
    method: "PATCH",
    body: payload,
  });
}

export function sendAdminUserVerificationEmail(
  userId: string,
): Promise<AdminUser> {
  return adminUsersRequest<AdminUser>(`users/${userId}/verification-email`, {
    method: "POST",
  });
}

export async function deleteAdminUser(userId: string): Promise<void> {
  await adminUsersRequest<void>(`users/${userId}`, {
    method: "DELETE",
  });
}

export function resyncAdminUserSubscription(
  userId: string,
): Promise<AdminSubscriptionActionResult> {
  return adminUsersRequest<AdminSubscriptionActionResult>(
    `users/${userId}/subscription/resync`,
    { method: "POST" },
  );
}

export function cancelAdminUserSubscription(
  userId: string,
): Promise<AdminSubscriptionActionResult> {
  return adminUsersRequest<AdminSubscriptionActionResult>(
    `users/${userId}/subscription/cancel`,
    { method: "POST" },
  );
}

export function resumeAdminUserSubscription(
  userId: string,
): Promise<AdminSubscriptionActionResult> {
  return adminUsersRequest<AdminSubscriptionActionResult>(
    `users/${userId}/subscription/resume`,
    { method: "POST" },
  );
}

export function grantAdminUserManualPlan(
  userId: string,
  payload: { plan_slug: string; reason: string },
): Promise<AdminSubscriptionActionResult> {
  return adminUsersRequest<AdminSubscriptionActionResult>(
    `users/${userId}/subscription/manual-plan`,
    { method: "POST", body: payload },
  );
}

export function revokeAdminUserManualPlan(
  userId: string,
  payload: { reason: string | null },
): Promise<AdminSubscriptionActionResult> {
  return adminUsersRequest<AdminSubscriptionActionResult>(
    `users/${userId}/subscription/manual-plan`,
    { method: "DELETE", body: payload },
  );
}

export function getAdminUserUsage(userId: string): Promise<AdminUserUsage> {
  return adminUsersRequest<AdminUserUsage>(`users/${userId}/usage`);
}

export function resetAdminUserUsage(userId: string): Promise<AdminUserUsage> {
  return adminUsersRequest<AdminUserUsage>(`users/${userId}/usage/reset`, {
    method: "POST",
  });
}
