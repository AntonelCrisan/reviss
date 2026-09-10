import { genericErrorFallback } from "@/lib/client-locale";
export type NotificationType =
  | "project_ready"
  | "weak_concepts"
  | "daily_review"
  | "weekly_progress"
  | "inactivity_reminder"
  | "streak_milestone";

export type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  project_id: string | null;
  project_name: string | null;
  created_at: string;
  read_at: string | null;
};

export type NotificationListResult = {
  items: Notification[];
  unread_count: number;
};

type ApiErrorPayload = {
  detail?: string | Array<{ msg?: string }>;
};

export class NotificationsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "NotificationsApiError";
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

async function notificationsRequest<T>(
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
    throw new NotificationsApiError(extractErrorMessage(payload), response.status);
  }

  return (await response.json()) as T;
}

export function listNotifications(): Promise<NotificationListResult> {
  return notificationsRequest<NotificationListResult>("me/notifications");
}

export function markAllNotificationsRead(): Promise<NotificationListResult> {
  return notificationsRequest<NotificationListResult>(
    "me/notifications/read-all",
    { method: "POST", body: "{}" },
  );
}

export function markNotificationRead(
  notificationId: string,
): Promise<Notification> {
  return notificationsRequest<Notification>(
    `me/notifications/${notificationId}/read`,
    { method: "POST", body: "{}" },
  );
}

export async function deleteNotification(notificationId: string): Promise<void> {
  const response = await fetch(`/api/auth/me/notifications/${notificationId}`, {
    method: "DELETE",
    credentials: "same-origin",
    cache: "no-store",
  });

  if (!response.ok) {
    let payload: ApiErrorPayload = {};
    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      // The fallback below handles non-JSON upstream errors.
    }
    throw new NotificationsApiError(extractErrorMessage(payload), response.status);
  }
}
