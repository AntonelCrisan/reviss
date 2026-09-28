"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { unsubscribeFromTips } from "@/lib/auth-api";

type UnsubscribeClientProps = {
  token?: string;
};

/**
 * Turns the tips off as soon as the page opens: someone who clicked
 * "stop these emails" has already made the decision, and a second button
 * to confirm it only reads as a way of keeping them subscribed.
 */
export function UnsubscribeClient({ token }: UnsubscribeClientProps) {
  const t = useTranslations("auth.unsubscribe");
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    token ? "loading" : "error",
  );
  const [message, setMessage] = useState(
    token ? t("working") : t("missingToken"),
  );
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current || !token) return;
    hasRun.current = true;

    async function stopEmails(unsubscribeToken: string) {
      try {
        const result = await unsubscribeFromTips(unsubscribeToken);
        setStatus(result.unsubscribed ? "success" : "error");
        setMessage(result.unsubscribed ? t("done") : t("failed"));
      } catch {
        setStatus("error");
        setMessage(t("failed"));
      }
    }

    void stopEmails(token);
  }, [t, token]);

  return (
    <div className="space-y-4">
      <div
        role="status"
        className={`rounded-2xl border px-4 py-4 text-sm font-semibold leading-6 ${
          status === "error"
            ? "border-danger-border bg-danger-soft text-danger"
            : status === "success"
              ? "border-success-border bg-success-soft text-success"
              : "border-info-border bg-info-soft text-info"
        }`}
      >
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
              status === "loading"
                ? "animate-pulse border-info text-info"
                : "border-current"
            }`}
          >
            {status === "loading" ? "" : status === "success" ? "✓" : "!"}
          </span>
          <span>{message}</span>
        </div>
      </div>

      <Link
        href="/settings#notifications"
        className="theme-shadow-action flex h-11 w-full items-center justify-center rounded-md bg-action px-5 text-sm font-bold text-on-action transition hover:-translate-y-0.5 hover:bg-action-hover"
      >
        {t("goToSettings")}
      </Link>
    </div>
  );
}
