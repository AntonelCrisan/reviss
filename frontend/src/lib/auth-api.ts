import { genericErrorFallback } from "@/lib/client-locale";
export type ThemePreference = "light" | "dark" | "system";
export type LanguagePreference = "ro" | "en" | "fr";
export type UserRole = "admin" | "user";

export type AuthUserPlan = {
  id: string;
  slug: string;
  name: string;
  price_ron: string | number;
  billing_interval: string;
  badge: string | null;
  material_limit: string;
  ai_level: string;
  storage: string;
  conditions: string;
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
  monthly_page_limit: number;
  ai_chat_enabled: boolean;
  is_featured: boolean;
};

export type AuthUser = {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  role: UserRole;
  created_at: string;
  theme_preference: ThemePreference;
  language_preference: LanguagePreference;
  current_plan: AuthUserPlan | null;
  account_deletion_request_pending: boolean;
  /** Null while the account still shows its initials. */
  avatar_updated_at: string | null;
};

/** The picture's address, versioned so a new upload replaces the cached one. */
export function avatarUrl(user: Pick<AuthUser, "avatar_updated_at">) {
  if (!user.avatar_updated_at) return null;
  return `/api/auth/me/avatar?v=${encodeURIComponent(user.avatar_updated_at)}`;
}

type ApiErrorPayload = {
  detail?: string | Array<{ msg?: string }>;
};

type MessageResponse = {
  message: string;
};

export class AuthApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AuthApiError";
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

async function authRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api/auth/${path}`, {
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
    throw new AuthApiError(extractErrorMessage(payload), response.status);
  }

  return (await response.json()) as T;
}

export function getCurrentUser(): Promise<AuthUser> {
  return authRequest<AuthUser>("me");
}

export function login(payload: {
  email: string;
  password: string;
  remember: boolean;
}): Promise<AuthUser> {
  return authRequest<AuthUser>("login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function register(payload: {
  full_name: string;
  email: string;
  password: string;
  accepted_terms: boolean;
  newsletter_consent: boolean;
}): Promise<MessageResponse> {
  return authRequest<MessageResponse>("register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function verifyEmail(token: string): Promise<AuthUser> {
  return authRequest<AuthUser>("verify-email", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

/** Sends the square the browser has already cropped and scaled. */
export async function uploadAvatar(file: Blob): Promise<AuthUser> {
  const body = new FormData();
  body.append("file", file, "avatar");

  const response = await fetch("/api/auth/me/avatar", {
    method: "PUT",
    credentials: "same-origin",
    // No Content-Type here on purpose: the browser adds it with the multipart
    // boundary, which a hand-written header would leave out.
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    let payload: ApiErrorPayload = {};
    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      // Falls through to the generic message below.
    }
    throw new AuthApiError(extractErrorMessage(payload), response.status);
  }

  return (await response.json()) as AuthUser;
}

/** Back to the initials. */
export function removeAvatar(): Promise<AuthUser> {
  return authRequest<AuthUser>("me/avatar", { method: "DELETE" });
}

/** Stops the tips and reminders from the link in one of those emails. */
export function unsubscribeFromTips(
  token: string,
): Promise<{ unsubscribed: boolean }> {
  return authRequest<{ unsubscribed: boolean }>(
    `notifications/unsubscribe?token=${encodeURIComponent(token)}`,
    { method: "POST" },
  );
}

export function requestPasswordReset(email: string): Promise<MessageResponse> {
  return authRequest<MessageResponse>("password-reset/request", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function confirmPasswordReset(payload: {
  token: string;
  password: string;
}): Promise<MessageResponse> {
  return authRequest<MessageResponse>("password-reset/confirm", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function changePassword(payload: {
  current_password: string;
  new_password: string;
}): Promise<MessageResponse> {
  return authRequest<MessageResponse>("me/password", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function updateFullName(fullName: string): Promise<AuthUser> {
  return authRequest<AuthUser>("me/name", {
    method: "PATCH",
    body: JSON.stringify({ full_name: fullName }),
  });
}

export function requestEmailChange(payload: {
  new_email: string;
  current_password: string;
}): Promise<MessageResponse> {
  return authRequest<MessageResponse>("me/email/change-request", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function confirmEmailChange(token: string): Promise<MessageResponse> {
  return authRequest<MessageResponse>("email/confirm", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function withdrawNewsletterConsent(): Promise<MessageResponse> {
  return authRequest<MessageResponse>("me/newsletter-consent/withdraw", {
    method: "POST",
    body: "{}",
  });
}

export function requestAccountDeletion(): Promise<MessageResponse> {
  return authRequest<MessageResponse>("me/deletion-request", {
    method: "POST",
    body: "{}",
  });
}

export function logout(): Promise<MessageResponse> {
  return authRequest<MessageResponse>("logout", {
    method: "POST",
    body: "{}",
  });
}

export function updateThemePreference(
  themePreference: ThemePreference,
): Promise<AuthUser> {
  return authRequest<AuthUser>("me/preferences", {
    method: "PATCH",
    body: JSON.stringify({ theme_preference: themePreference }),
  });
}

export function updateLanguagePreference(
  languagePreference: LanguagePreference,
): Promise<AuthUser> {
  return authRequest<AuthUser>("me/preferences", {
    method: "PATCH",
    body: JSON.stringify({ language_preference: languagePreference }),
  });
}
