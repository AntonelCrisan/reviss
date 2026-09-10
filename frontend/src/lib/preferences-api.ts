import { genericErrorFallback } from "@/lib/client-locale";
export type StudyPace = "light" | "balanced" | "exam";
export type AiFeedbackStyle = "short" | "guided" | "exam";
export type NotifyFrequency = "instant" | "daily";

export type StudyPreferences = {
  study_pace: StudyPace;
  ai_feedback_style: AiFeedbackStyle;
  automation_daily_review: boolean;
  automation_weak_concept_alerts: boolean;
  notify_email_enabled: boolean;
  notify_alert_project_ready: boolean;
  notify_alert_billing: boolean;
  automation_weekly_progress: boolean;
  automation_inactivity_reminder: boolean;
  notify_alert_streak_milestone: boolean;
  notify_frequency: NotifyFrequency;
  newsletter_consent: boolean;
};

export type StudyPreferencesUpdate = Partial<StudyPreferences>;

type ApiErrorPayload = {
  detail?: string | Array<{ msg?: string }>;
};

export class PreferencesApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PreferencesApiError";
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

async function preferencesRequest<T>(
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
    throw new PreferencesApiError(extractErrorMessage(payload), response.status);
  }

  return (await response.json()) as T;
}

export function getStudyPreferences(): Promise<StudyPreferences> {
  return preferencesRequest<StudyPreferences>("me/study-preferences");
}

export function updateStudyPreferences(
  patch: StudyPreferencesUpdate,
): Promise<StudyPreferences> {
  return preferencesRequest<StudyPreferences>("me/study-preferences", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}
