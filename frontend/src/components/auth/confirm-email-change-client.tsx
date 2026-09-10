"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { AuthApiError, confirmEmailChange } from "@/lib/auth-api";

type ConfirmEmailChangeClientProps = {
  token?: string;
};

export function ConfirmEmailChangeClient({
  token,
}: ConfirmEmailChangeClientProps) {
  const t = useTranslations("auth.confirmChange");
  const [message, setMessage] = useState(
    token ? t("checking") : t("missingToken"),
  );
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    token ? "loading" : "error",
  );
  const hasConfirmed = useRef(false);

  useEffect(() => {
    if (hasConfirmed.current) return;
    hasConfirmed.current = true;

    if (!token) return;
    const confirmationToken = token;

    async function confirmEmail() {
      try {
        const result = await confirmEmailChange(confirmationToken);
        setStatus("success");
        setMessage(result.message);
      } catch (error) {
        setStatus("error");
        setMessage(
          error instanceof AuthApiError ? error.message : t("failed"),
        );
      }
    }

    void confirmEmail();
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

      <div className="grid gap-2 sm:grid-cols-2">
        <Link
          href="/login"
          className="flex h-11 items-center justify-center rounded-md border border-subtle bg-surface px-5 text-sm font-bold text-content transition hover:border-action"
        >
          {t("login")}
        </Link>
        <Link
          href="/myaccount"
          className="theme-shadow-action flex h-11 items-center justify-center rounded-md bg-action px-5 text-sm font-bold text-on-action transition hover:-translate-y-0.5 hover:bg-action-hover"
        >
          {t("goToAccount")}
        </Link>
      </div>
    </div>
  );
}
